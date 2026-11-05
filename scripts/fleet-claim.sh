#!/usr/bin/env bash
# fleet-claim.sh — issue-level claim ledger for parallel agent hosts.
#
# The mutex is the git ref refs/heads/claim/<issue>: creating it is atomic
# (second host gets 422), deleting it releases the slice. Labels are the
# human-readable projection of that state; see docs/fleet-concurrency.md.
#
# Usage:
#   ./scripts/fleet-claim.sh preflight
#   ./scripts/fleet-claim.sh claim <issue> [slug]
#   ./scripts/fleet-claim.sh release <issue> [reason]
#   ./scripts/fleet-claim.sh takeover <issue> [slug]
#   ./scripts/fleet-claim.sh status
#
# Env:
#   FLEET_REPO        default gmedia/vuln-scanner
#   FLEET_HOST        default $(hostname -s); stable unique id per machine
#   FLEET_LEASE_HOURS default 24

set -euo pipefail

REPO="${FLEET_REPO:-gmedia/vuln-scanner}"
HOST="${FLEET_HOST:-$(hostname -s)}"
LEASE_HOURS="${FLEET_LEASE_HOURS:-24}"
CLAIM_PREFIX="claim/"

die() { printf 'fleet: %s\n' "$*" >&2; exit 1; }
say() { printf '%s\n' "$*"; }

need_gh() {
  command -v gh >/dev/null 2>&1 || die "gh CLI not installed"
  gh auth status >/dev/null 2>&1 || die "gh not authenticated on this host"
}

claim_sha() {
  git fetch --quiet origin main 2>/dev/null || die "cannot fetch origin/main"
  git rev-parse origin/main
}

claim_exists() {
  gh api "repos/$REPO/git/ref/heads/${CLAIM_PREFIX}$1" >/dev/null 2>&1
}

issue_labels() {
  gh issue view "$1" --repo "$REPO" --json labels --jq '.labels[].name'
}

issue_state() {
  gh issue view "$1" --repo "$REPO" --json state --jq '.state'
}

last_claim_comment() {
  gh issue view "$1" --repo "$REPO" --json comments \
    --jq '[.comments[] | select(.body | startswith("CLAIM "))] | last // empty'
}

print_claims() {
  # The refs are the truth: state:claimed is only a projection, and a slice in
  # review still reserves the work (the claim ref survives until merge/release).
  local days
  days=$(git ls-remote --heads origin 'refs/heads/claim/*' 2>/dev/null \
    | sed 's#.*refs/heads/claim/##' | sort -n | tr '\n' ' ')

  printf '  %-7s %-18s %-22s %-8s %s\n' ISSUE HOST AT LEASE TITLE

  local n title host at lease
  for n in $days; do
    title=$(gh issue view "$n" --repo "$REPO" --json title --jq '.title' 2>/dev/null | cut -c1-56)
    [ -n "$title" ] || title="(issue not found)"
    host=$(last_claim_comment "$n" | sed -n 's/.*host=\([^ ]*\).*/\1/p')
    at=$(last_claim_comment "$n" | sed -n 's/.*at=\([^ ]*\).*/\1/p')
    lease=$(last_claim_comment "$n" | sed -n 's/.*lease=\([^ ]*\).*/\1/p')
    printf '  %-7s %-18s %-22s %-8s %s\n' "#$n" "${host:-?}" "${at:-?}" "${lease:-?}" "$title"
  done

  # Flips the other way: a claim label with no ref is inconsistent and must be
  # resolved by hand (release + claim), never assumed.
  local stale
  stale=$(gh issue list --repo "$REPO" --state open --label state:claimed --limit 100 \
    --json number --jq '.[].number')
  for n in $stale; do
    claim_exists "$n" && continue
    title=$(gh issue view "$n" --repo "$REPO" --json title --jq '.title' | cut -c1-56)
    printf '  %-7s %-18s %-22s %-8s %s\n' "#$n" "-" "-" "-" "$title  [label without ref - inconsistent]"
  done

  # Pre-ledger PRs have state:review but no claim ref. They still reserve work.
  local review
  review=$(gh issue list --repo "$REPO" --state open --label state:review --limit 100 \
    --json number --jq '.[].number')
  for n in $review; do
    claim_exists "$n" && continue
    title=$(gh issue view "$n" --repo "$REPO" --json title --jq '.title' | cut -c1-56)
    printf '  %-7s %-18s %-22s %-8s %s\n' "#$n" "-" "-" "-" "$title  [review, no ref: PR is the reservation]"
  done
}

print_prs() {
  gh pr list --repo "$REPO" --state open --limit 60 \
    --json number,title,headRefName,isDraft,updatedAt \
    --jq '.[] | "  #\(.number)  \(.headRefName)  \(if .isDraft then "draft" else "open" end)  \(.updatedAt[0:16])  \(.title)"'
}

print_ready() {
  gh issue list --repo "$REPO" --state open --label state:ready --limit 100 \
    --json number,title,milestone,labels \
    --jq '.[] | "  #\(.number)  \(.milestone.title // "no milestone")  [\([.labels[].name | select(startswith("size:") or startswith("area:"))] | join(","))]  \(.title)"'
}

print_orphans() {
  local pr_heads
  pr_heads=$(gh pr list --repo "$REPO" --state open --limit 100 --json headRefName --jq '.[].headRefName')
  git ls-remote --heads origin 2>/dev/null \
    | sed 's#.*refs/heads/##' \
    | grep -Ev '^(main|dependabot/.*|'"${CLAIM_PREFIX}"'.*)$' \
    | grep -Ev '^(feat|fix|chore|docs|refactor|test|perf)/[0-9]+-' \
    | while read -r b; do
        printf '%s\n' "$pr_heads" | grep -qxF "$b" && continue
        printf '  %s\n' "$b"
      done
}

cmd_preflight() {
  need_gh
  say "== Fleet pre-flight (host=$HOST) =="
  say ""
  say "Claims held:"
  print_claims
  say ""
  say "Open PRs (identity is shared - all of them matter):"
  print_prs
  say ""
  say "Ready work (state:ready):"
  print_ready
  say ""
  say "Branches without an issue number and without a claim (legacy residue - do not build on them):"
  print_orphans
  say ""
  say "Next: claim one ready issue. Do not start on a claimed issue."
}

cmd_status() {
  need_gh
  print_claims
}

cmd_claim() {
  local issue="${1:-}" slug="${2:-}"
  [ -n "$issue" ] || die "usage: claim <issue> [slug]"
  [ -n "$slug" ] || die "usage: claim <issue> <slug>  (slug is required so the branch embeds the issue number)"

  need_gh
  [ "$(issue_state "$issue")" = "OPEN" ] || die "issue #$issue is not open"
  claim_exists "$issue" && die "issue #$issue already claimed (ref ${CLAIM_PREFIX}$issue exists)"

  if issue_labels "$issue" | grep -qx 'state:claimed'; then
    die "issue #$issue is labelled state:claimed without a ref - resolve manually (release then claim)"
  fi
  if issue_labels "$issue" | grep -qx 'state:human'; then
    die "issue #$issue is state:human - owner/ops work, not agent work"
  fi

  local prs
  prs=$(gh pr list --repo "$REPO" --state open --json number,headRefName \
    --jq "[.[] | select(.headRefName | test(\"[/-]${issue}-\"))] | length")
  [ "$prs" = "0" ] || die "an open PR already uses issue #$issue - coordinate, do not duplicate"

  local sha
  sha=$(claim_sha)

  # Atomic mutex: 422 if another host won the race.
  if ! gh api --method POST "repos/$REPO/git/refs" \
      -f ref="refs/heads/${CLAIM_PREFIX}${issue}" -f sha="$sha" >/dev/null 2>&1; then
    die "lost the race for #$issue - another host created the claim ref first"
  fi

  gh issue edit "$issue" --repo "$REPO" \
    --remove-label state:ready --add-label state:claimed >/dev/null 2>&1 || true
  gh issue comment "$issue" --repo "$REPO" \
    --body "CLAIM host=$HOST at=$(date -u +%Y-%m-%dT%H:%M:%SZ) lease=${LEASE_HOURS}h branch=$issue-$slug" >/dev/null

  local branch="feat/$issue-$slug"
  git switch -c "$branch" "$sha" >/dev/null 2>&1 || git switch "$branch"

  say "claimed #$issue as $HOST"
  say "  ref:    refs/heads/${CLAIM_PREFIX}${issue}"
  say "  branch: $branch"
  say ""
  say "When done (merged or abandoned): ./scripts/fleet-claim.sh release $issue"
}

cmd_release() {
  local issue="${1:-}" reason="${2:-released}"
  [ -n "$issue" ] || die "usage: release <issue> [reason]"
  need_gh

  if claim_exists "$issue"; then
    gh api --method DELETE "repos/$REPO/git/refs/heads/${CLAIM_PREFIX}${issue}" >/dev/null 2>&1 \
      || die "could not delete claim ref for #$issue"
  fi

  gh issue comment "$issue" --repo "$REPO" \
    --body "RELEASE host=$HOST at=$(date -u +%Y-%m-%dT%H:%M:%SZ) reason=$reason" >/dev/null

  if [ "$(issue_state "$issue")" = "OPEN" ]; then
    gh issue edit "$issue" --repo "$REPO" \
      --remove-label state:claimed --add-label state:ready >/dev/null 2>&1 || true
  fi

  say "released #$issue ($reason)"
}

cmd_takeover() {
  local issue="${1:-}" slug="${2:-}"
  [ -n "$issue" ] || die "usage: takeover <issue> [slug]"
  [ -n "$slug" ] || die "usage: takeover <issue> <slug>"
  need_gh

  local at prev
  at=$(last_claim_comment "$issue" | sed -n 's/.*at=\([^ ]*\).*/\1/p')
  prev=$(last_claim_comment "$issue" | sed -n 's/.*host=\([^ ]*\).*/\1/p')
  [ -n "$at" ] || die "#$issue has no CLAIM comment - use claim, not takeover"

  local at_epoch now_epoch
  at_epoch=$(date -u -d "$at" +%s 2>/dev/null) || die "cannot parse claim time: $at"
  now_epoch=$(date -u +%s)
  if [ $(( (now_epoch - at_epoch) / 3600 )) -lt "$LEASE_HOURS" ]; then
    die "#$issue lease is still live (claimed by ${prev:-?} at $at) - ask the user, do not steal"
  fi

  gh issue comment "$issue" --repo "$REPO" \
    --body "STALE-TAKEOVER host=$HOST previous=${prev:-?} at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >/dev/null
  cmd_release "$issue" "stale-takeover"
  cmd_claim "$issue" "$slug"
}

case "${1:-}" in
  preflight) cmd_preflight ;;
  status)    cmd_status ;;
  claim)     shift; cmd_claim "$@" ;;
  release)   shift; cmd_release "$@" ;;
  takeover)  shift; cmd_takeover "$@" ;;
  *) sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//' ; exit 1 ;;
esac
