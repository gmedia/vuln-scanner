#!/usr/bin/env bash
# Requirements sync guard.
#
# backend/ and workers/ share Python code: workers imports `app.config`,
# `app.database`, `app.services.*`, and `app.models.*` from the backend image.
# A package pinned to different versions in the two files therefore runs the
# same code against two different dependency versions — a failure that only
# shows up at runtime in the worker.
#
# Dependabot cannot see this: it bumps one file at a time.
#
# Usage: ./scripts/check-requirements-sync.sh
# Exit 0 when shared pins match; exit 1 listing the mismatches.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

BACKEND="backend/requirements.txt"
WORKERS="workers/requirements.txt"

for f in "$BACKEND" "$WORKERS"; do
  [[ -f "$f" ]] || { echo "error: missing $f (run from the repo root)" >&2; exit 2; }
done

# Emit "name<TAB>version" for every exact `name==version` pin.
pins() {
  sed -nE 's/^([A-Za-z0-9_.-]+)(\[[^]]*\])?==([^ ;#]+).*/\1\t\3/p' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sort -u
}

backend_pins="$(pins "$BACKEND")"
workers_pins="$(pins "$WORKERS")"

if [[ -z "$backend_pins" || -z "$workers_pins" ]]; then
  echo "error: no pins parsed from $BACKEND or $WORKERS — check the file format" >&2
  exit 2
fi

shared="$(comm -12 <(cut -f1 <<<"$backend_pins" | sort -u) \
                    <(cut -f1 <<<"$workers_pins" | sort -u))"

if [[ -z "$shared" ]]; then
  echo "error: backend and workers share no pinned packages — refusing to report OK" >&2
  exit 2
fi

fail=0
mismatches=""
while IFS= read -r name; do
  [[ -z "$name" ]] && continue
  b_ver="$(awk -F'\t' -v n="$name" '$1 == n { print $2 }' <<<"$backend_pins")"
  w_ver="$(awk -F'\t' -v n="$name" '$1 == n { print $2 }' <<<"$workers_pins")"
  if [[ "$b_ver" != "$w_ver" ]]; then
    mismatches+="  $name: $BACKEND=$b_ver  $WORKERS=$w_ver"$'\n'
    fail=1
  fi
done <<<"$shared"

if [[ "$fail" -ne 0 ]]; then
  echo "FAIL: shared packages pinned to different versions:" >&2
  printf '%s' "$mismatches" >&2
  echo >&2
  echo "workers import backend modules, so these must match. Align the pins in" >&2
  echo "the same PR (usually by taking the newer version)." >&2
  exit 1
fi

echo "OK: $(wc -l <<<"$shared" | tr -d ' ') shared pinned packages match across $BACKEND and $WORKERS."
