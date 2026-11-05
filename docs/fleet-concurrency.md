# Fleet concurrency — many agent hosts, one repo

**Status:** active protocol. Normative for every OpenCode host that pushes to this repo.
**Related:** [`AGENTS.md`](../AGENTS.md) (workflow), [`docs/AGENT_EXECUTION_GUIDE.md`](AGENT_EXECUTION_GUIDE.md) (priority).

---

## 0) The problem this solves

Several OpenCode hosts work this repo in parallel against **one GitHub account**. Two failure
modes follow directly from that:

1. **Identity is shared.** `gh pr list --author @me` returns every host's PRs, so "your PR" is
   not a meaningful filter and `AGENTS.md`'s "PR you did not author → leave alone" rule cannot be
   executed. Host A can pick up Host B's half-finished PR and "helpfully" fix it.
2. **Nothing reserves work.** Before this protocol the repo had **0 issues and 0 milestones**.
   Two hosts reading the same `docs/specs/*.md` pick the same slice, create near-identical
   branches (`fix/public-seo-plumbing` vs `fix/public-seo`), and collide at merge time.

Markdown cannot fix either one: a `handoff.md` edit is last-write-wins and every host that touches
it creates a merge conflict. The reservation has to live somewhere with **compare-and-swap**
semantics. Git refs have that; labels and comments do not.

**Single source of truth is therefore:**

| Question | Authority |
|---|---|
| What work exists? | GitHub **issue** (one per spec slice) |
| Who owns slice X right now? | existence of `refs/heads/claim/<issue>` |
| May I touch branch Y? | open **PR** + `state:claimed` issue + claim ref |
| What is the phase priority? | [`docs/AGENT_EXECUTION_GUIDE.md`](AGENT_EXECUTION_GUIDE.md) §1.3.1 |

Labels (`state:*`) and comments are the **human-readable projection** of that state. They are
informational; the claim ref is the lock.

---

## 1) Layers

### 1.1 Issues = the unit of work

One issue per *slice* (a spec's `S3`, `PY12`, an `I10`, a CI job), never one issue per spec and
never one issue per file. Labels:

| Label | Meaning |
|---|---|
| `state:ready` | Claimable. Nobody holds it. |
| `state:claimed` | A host holds `claim/<issue>`. **Do not touch.** |
| `state:review` | PR open, CI running/red, waiting. **Do not re-implement.** |
| `state:blocked` | Waiting on `blocked_by` issue. |
| `state:human` | Owner/ops action. Agents must not do it. |
| `area:…` | `billing payments promo public host guard siem uptime scan platform ci docs frontend design` |
| `size:S/M/L` | `S` ≤ 1 file-ish, `M` a feature slice, `L` multi-layer slice |
| `kind:code/docs/ops-human` | Deliverable type |

Milestones group issues into waves (`W1 Payments & Promo` … `W7 Fleet & CI hardening`). A
milestone is a reporting device; it does **not** reserve anything.

### 1.2 Claim ref = the mutex

A claim is the creation of a git ref, nothing else:

```bash
gh api --method POST repos/gmedia/vuln-scanner/git/refs \
  -f ref="refs/heads/claim/1234" \
  -f sha="$(gh api repos/gmedia/vuln-scanner/git/ref/heads/main --jq .object.sha)"
```

Why a ref and not a label edit:

- Creating a ref is **atomic**. The second host gets `422 Reference already exists`. No
  read-modify-write window, no lost update.
- Label edits are last-write-wins; two hosts can both "successfully" claim and both see
  `state:claimed`.
- A ref is visible in `git ls-remote`, so a host does not even need API access to detect it.

`claim/*` refs are bookkeeping, not work branches. They point at the commit `main` had when the
claim was taken; that commit is never built or deployed.

### 1.3 Work branch

The work branch is separate and must embed the issue number:

```
feat/<issue>-<slug>     fix/<issue>-<slug>
```

`feat/1234-payments-provider-verify`. The number makes `git ls-remote | grep 1234` self-answering
and prevents two hosts from independently choosing the same human-readable name. Branches without
an issue number are legacy and must not be created again.

### 1.4 Lease

A claim ref has no timestamp, so the lease lives in the issue comment written at claim time:

```
CLAIM host=tc1 at=2026-11-05T07:30:00Z lease=24h
```

Rules:

- A claim is **live** for `FLEET_LEASE_HOURS` (default 24) **or** while the host keeps pushing.
- After the lease expires **and** the branch has no push for 24 h, any host may take over:
  comment `STALE-TAKEOVER host=<host> previous=<host>`, then release + claim.
- Never take over a claim that is inside its lease. Ask the user instead.
- Release is mandatory on completion **and** on abandonment.

### 1.5 Review state

`state:claimed` → PR opened → `state:review`. `state:review` is still reserving: a second host
must not open a competing PR for the same slice, but it **may** review, comment, or push a fix if
the user names that PR.

Pre-ledger PRs may carry `state:review` with no `claim/<issue>` ref (they predate this protocol).
For those, **the open PR is the reservation**; `preflight` prints them with `review, no ref`. Do
not create a claim ref for another host's in-flight PR.

Only the claim holder (or the user) merges. Merge closes the issue → the claim ref is deleted.

---

## 2) Per-host setup (one time, per machine)

A PAT per host buys **blast-radius isolation**, not identity separation:

- Leaked token on host A can be revoked without breaking hosts B–E.
- Separate rate-limit budget and separate audit entries per token.
- It does **not** make `gh pr list --author @me` host-specific — that requires a machine user per
  host, which this project does not use. **Never rely on `--author @me` to decide ownership.**

Fine-grained PAT, scoped to `gmedia/vuln-scanner` only:

| Permission | Level |
|---|---|
| Contents | Read and write (claim refs, branches) |
| Issues | Read and write (claim/release comments, labels) |
| Pull requests | Read and write |
| Metadata | Read (mandatory) |

Do **not** grant `project` unless the host maintains the board. Do **not** grant org-wide or
`admin:*` scopes; the classic token currently in use carries `repo` + `admin:public_key` for the
whole account, which is exactly the blast radius this protocol is trying to shrink.

Install per host (never in the repo, never in shell history you share):

```bash
# store under the host's gh config, one token per machine
GH_TOKEN=... gh auth login --hostname github.com --git-protocol ssh --with-token

# host identity used in claim comments (NOT the GitHub login)
export FLEET_HOST=tc1          # add to the host's shell profile
```

`FLEET_HOST` must be stable and unique per machine (`tc1`, `tc5`, `lab-2`, …). It is the only
per-host discriminator in the ledger.

---

## 3) Session protocol

### 3.1 Pre-flight (replaces the old "check my PRs" step)

```bash
./scripts/fleet-claim.sh preflight
```

It prints, in one block:

1. **Claims held** — `state:claimed` issues + `CLAIM` comment age (host, at, lease).
2. **Open PRs** — every one, because identity is shared. Cross-referenced with the issue number in
   the branch name.
3. **Ready work** — `state:ready` issues for the active milestone, highest priority first.
4. **Orphan branches** — remote branches with no issue number and no open PR. These are residue
   from earlier sessions; do not build on them, and do not delete them unless you created them.

If a PR is open for a `state:review` issue, that is another host's work: **leave it**.

### 3.2 Claim

```bash
./scripts/fleet-claim.sh claim 1234 payments-provider-verify
```

`claim` refuses unless all of these hold: issue open, labelled `state:ready`, no `claim/1234` ref
on the remote, no open PR whose head branch contains `1234`. It then creates the ref (the mutex),
flips the labels, writes the `CLAIM` comment, and creates the local branch from `origin/main`.

### 3.3 Work, push, PR

Normal `AGENTS.md` rules apply: small commits, conventional messages, push immediately, PR body per
template, `Closes #1234` in the body so the merge closes the issue.

### 3.4 Release

```bash
./scripts/fleet-claim.sh release 1234        # after merge, or when abandoning
```

Deletes the claim ref, writes `RELEASE host=<host> reason=<merged|abandoned>`, and returns the
issue to `state:ready` unless it was closed.

---

## 4) Hard rules

1. **Never edit `handoff.md`, `docs/AGENT_EXECUTION_GUIDE.md` §1.3.1, or another host's issue
   body** to announce work. Use the claim ref + issue comment. Those files are read-mostly and
   only updated by the host that merged the wave.
2. **Never work on a branch whose issue is not yours.** If `claim/<n>` exists and the `CLAIM`
   comment is not you, stop.
3. **Never create a branch without an issue number.** If no issue fits, create the issue first, or
   report the gap to the user.
4. **Never delete another host's claim or branch.** Stale takeover has its own comment form, and
   only after the lease expired.
5. **One slice per PR.** A slice is an issue. Two unrelated changes → two issues → two PRs.
6. **`state:human` issues are not agent work.** GTM, customer meetings, SES/SNS provisioning,
   DNS/SSL, finance SIDs. Agents file them, agents do not do them.
7. **Priority still comes from the guide.** An empty `state:ready` queue means "report and wait",
   not "invent work".

---

## 5) Board (optional, needs `project` scope)

`gh` tokens in this fleet intentionally do **not** carry `project`. Whoever maintains the board runs
once:

```bash
gh auth refresh -s project,read:project
```

Then create one org-level project with three views:

| View | Layout | Group / columns |
|---|---|---|
| **Roadmap** | Roadmap | group by milestone, dates from milestone due date |
| **Board** | Board | columns `state:ready` → `state:claimed` → `state:review` → closed |
| **Fleet** | Table | `FLEET_HOST`, area, size, lease age |

The board is a **view** of issues, never a second source of truth. If the board and the claim refs
disagree, the refs win.

---

## 6) Why not a markdown roadmap file

- It cannot express a lock: no CAS, no atomicity.
- It conflicts on every concurrent edit, which is the exact failure it would be trying to prevent.
- `AGENTS.md` already declares `docs/AGENT_EXECUTION_GUIDE.md` the priority authority. A second
  roadmap document would be a competing authority, and the next session would have to decide which
  one is stale.
- Issue state survives restarts, is queryable (`gh issue list --label state:ready`), and links
  directly to the PR that closed it.
