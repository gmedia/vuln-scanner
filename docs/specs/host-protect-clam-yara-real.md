# Plan: Host Protect — honest ClamAV + real YARA CLI

**Status:** **plan only** (2026-09-09). **Oracle: conditional APPROVE** (MUST-FIX folded into §4–§5). Do **not** implement until the user names a slice **and** says `buat` / `kerjakan`.
**Epic:** follow-on to **P12 S10/S12** (already on `main`). Not a new WAF pack. Not P14 **G/H**.
**Legal:** original pack only. No Imunify/CloudAV/CRS dump. No community YARA vendor into git. Never paste WAF onto `sinexis.app` edge.
**CI:** must stay green **without** `clamscan` / `yara` packages.

Related: [`host-protect-v1.md`](host-protect-v1.md) §10.1 S10–S12 · [`imunify-class-onbox.md`](imunify-class-onbox.md) · [`../commercial/imunify-beside-not-roadmap.md`](../commercial/imunify-beside-not-roadmap.md) · helper `packaging/host-protect-helper/sinexis_host_scan.py` · dual pack `php_webshell.yar`.

---

## 0) Why this plan (locked from product session)

| User said | Plan implication |
|-----------|------------------|
| Tired of copy-paste WAF/YARA **ID slices** | **Do not** default to WAF 1147+ or more needles. Open PRs **#706** / **#708** are pack-widen; merge is human/CI, not this epic. |
| Interested in **ClamAV** and **YARA sungguhan** | Use engines already specified in S10 (optional CLI) and S12 (optional Clam). |
| Asked if existing rules become **garbage / conflict** | They do **not**. Three pipelines. See §1. |

---

## 1) Current architecture (do not re-implement)

```text
Customer VM (helper poll)
  scan_needles(php_webshell.yar)  → POST engine=needles (today may lie as yara)  findings sinexis.php.*
  scan_clam() if clamdscan|clamscan on PATH → POST engine=clam  findings clam.*
  WAF tail (separate) → POST /api/host/agent/waf-events  rule_id 1001–1143 (main)

SaaS ingest
  /api/host/agent/results   HIT_ENGINES yara|needles|clam|mock
  /api/host/agent/waf-events  is_product_waf_rule numeric
  Dedup host_hits: (site_id, rel_path, rule_id)  — not engine
```

| Layer | What it is | Collision with Clam/YARA CLI? |
|-------|------------|-------------------------------|
| **Host WAF** | ModSecurity IDs **1001–1143** on `main` (**1144–1146** if **#708** merges) | **None.** Different URL, table, ID shape. |
| **Needles S10** | Dual `.yar` parsed for `meta.id`, `hit_class`, `$a="..."`. **`condition:` ignored at runtime.** Pack **does** include `condition: any of them`. | Keep as **fallback**. Do **not** unbounded `yara -r` on jail root. |
| **Clam S12** | `scan_clam()` already POSTs `engine=clam`, `rule_id=clam.<sig>`. `Recommends: clamav`. No CVD in git. | **Ops/lab gap**, not a missing function. |

**Honesty bug (must fix first):** helper `run()` always `scan_needles`, then `engine = "yara" if yara_available() else "needles"` (`which` only). SaaS `host_scan_runner.py` also labels local walk **`engine = "yara"`** — same lie. CLI is **never** invoked.

**YARA identifier vs product `rule_id`:** compiler name is `sinexis_php_eval_post`; product ID is `meta.id` = `sinexis.php.eval_post`. Real CLI **must** map `meta.id` (or `-p` / compiled output that includes meta). Tests assert `sinexis.php.*`.

---

## 2) Goals

1. **`engine=` means the scanner that produced the findings.**
   - `needles` — substring walk.
   - `yara` — **only** after a successful `yara` (or equivalent) scan of **our** pack.
   - `clam` — unchanged.
2. **Clam live on lab box (tc5 fixture)** without requiring Clam in CI images.
3. **Optional real YARA CLI** on the **same original pack**, with needle fallback if CLI missing or compile/timeout fails.
4. **No double-count of the same `sinexis.php.*` ID** from needles **and** CLI in one poll.
5. **No** WAF ID growth, **no** G/H, **no** Imunify DB, **no** `yara-python` as a required Debian dep (CLI optional; Python stdlib + subprocess).

---

## 3) Non-goals

| Out | Why |
|-----|-----|
| WAF 1147+ / more original needles | User pivoted; pack PRs already exist |
| Vendor `php.yar` from GitHub into git | License + FP + “dump” smell |
| yara-python / pylibclamav required | CI + helper is stdlib; `Recommends` only |
| CVD files in the repo | Size + freshness; `freshclam` on box |
| Replace WAF with CRS | Different product; legal |
| `engine=yara` while still only needles | That is the bug |
| SaaS `os.walk` customer disk | P14 **B** already false |
| Merge #706/#708 from this plan | Human/CI |

---

## 4) Slices (one PR stream each)

Do **not** mix slices. Lab: **tc5 fixture**, never `sx-erpstg`. CI without Clam/YARA packages.

### Slice **Y0** — Honest `engine=` (code, no lab)

**In:** Helper `run()` (and any SaaS `host_engine` label if it ever claims yara).

**Behavior:**

```text
findings = scan_needles(...)
engine = "needles"
# do not set engine=yara from which("yara")
```

**Tests:** `test_needles_hit_*` must assert `engine == "needles"` when PATH has no working CLI **or** when CLI is not invoked. Today they allow `("needles", "yara")` — tighten.

**DoD:** pytest helper green; no binary required. SPA/API showing `yara` without CLI is a **fail**.

**Also Y0:** SaaS `host_scan_runner.py` local walk must not hard-code `engine = "yara"`. Tests: monkeypatch `which` so a CI image that happens to have `yara` cannot keep the old assertion green.

**Out:** invoking `yara`; Clam unit changes; systemd.

### Slice **C1** — Clam lab + unit honesty (ops + small code if needed)

**Already shipped:** `scan_clam`, second POST, `rule_id=clam.*`, skip if no binary, `--fdpass` for `clamdscan`.

**Gap:** empty hits when `clamdscan` times out / cannot talk to `clamd` under **`ProtectSystem=strict`**. Socket is typically `/run/clamav/clamd.ctl` (not in `ReadWritePaths`). `--fdpass` still needs **AF_UNIX** to the daemon (unit already allows `AF_UNIX`).

**Do (code only if lab proves it):**

1. Document AM: `apt install clamav clamav-daemon` **or** `clamav` (clamscan-only); `freshclam`; enable `clamav-daemon`.
2. If `clamdscan` **exit 2** / stderr “Can't connect to clamd” / timeout: **one `clamscan` fallback** (still timeout). Empty stdout **is not** “clean” when the daemon is down. Do **not** widen `ReadWritePaths` to `/`.
3. **Do not** add `ReadOnlyPaths=/run/clamav` as the Clam fix (`ProtectSystem=strict` already remounts RO; RO path grant does not enable the socket). If lab still blocks after `clamscan` fallback: **`ReadWritePaths=-/run/clamav`** (or BindPaths) **after proof**. Never `ProtectSystem=false`.
4. **Ingest:** second POST (`engine=clam`) must **add** hits. Today `_finish_scan` on the Clam POST can **replace** `hit_count` and hide PHP needles. Fix additive/idempotent finish (or one payload with mixed engines — prefer **additive second POST**, no schema change).
5. **Deadline:** needles/YARA + Clam each 120s can exceed `TimeoutStartSec=180` and poll ~90s. Share **one wall-clock** for the poll.
6. Unit test: mock FOUND → `clam.*`; timeout → `[]`; missing binary → `[]`; exit 2 + “Can't connect” → fallback path.

**DoD:** scripted lab on **tc5** fixture with EICAR **or** a documented Clam test file **under jail prefix** → ingest `engine=clam`. **Never** commit EICAR as a “real customer” path. CI still skips Clam.

**Out:** bundling CVD; requiring daemon in CI; changing WAF.

### Slice **Y1** — Real YARA CLI on original pack (same walk, not unbounded `-r`)

**In:** helper only (SaaS worker walk is lab-flag; do not add yara there unless the same tests).

**Algorithm (locked):**

```text
pack_path = rules_dir / php_webshell.yar   # dual-ship; keep in sync
if which("yara") and _yara_compile_ok(pack_path):
    hits = scan_yara_cli(root, pack_path, timeout)
    if hits is not None:          # process ran; parse stdout
        POST engine=yara, findings mapped via meta.id
        skip scan_needles for this poll
    else:
        fallback scan_needles, engine=needles
else:
    scan_needles, engine=needles
then scan_clam as today (separate POST)
```

**CLI constraints (Oracle MUST-FIX):**

- **Same walk as `scan_needles`** (`_SKIP_DIRS`, `_MAX_FILES` 500, `_MAX_BYTES` 1MiB, jail `validate_root_path`). **Forbidden:** unbounded `yara -r` on `/home` (unit `ReadWritePaths` includes `/home`; CLI would ignore caps and burn systemd 180s).
- **One (or few) `yara` process(es):** `yara -w pack.yar file1 file2 …` chunked on `ARG_MAX`. **Not** 500 forks. **Not** `-C` on source `.yar` (`-C` = compiled `yarac` output; compiled-untrusted = RCE). **Not** `-s` matching strings into SaaS JSON.
- Timeout: **shared deadline** with Clam (see C1). Timeout / compile fail / `OSError` → `None` → needles. **Do not** partial-POST yara.
- **Zero hits after successful CLI** → POST `engine=yara`, `findings=[]`, **skip needles** (honest empty).
- Parse stdout: **split on first whitespace only** (`rule` then path-with-spaces). Path must stay under `root`. Map compiler name `sinexis_php_eval_post` → `meta.id`. **`load_signature_pack` must capture `rule \w+`**, not only body. Unmapped → **drop**.
- Dual pack: if `.yar` changes, copy backend + helper.
- Optional later: `-z` skip huge files if installed yara ≥ 4.2.

**Tests (no yara package):**

- Monkeypatch `which` → None → needles.
- Monkeypatch `subprocess.run` with fake stdout `sinexis_php_eval_post /jail/root/shell.php` → finding `sinexis.php.eval_post`, `engine=yara`.
- Compile-fail (nonzero, stderr `error:`) → needles.
- Do **not** call real `yara` in CI.

**DoD:** pytest as above; lab optional if `yara` installed on tc5.

**Out:** community rules; changing `meta.id` strings; posting both needles and yara for the same IDs.

### Slice **Y2** (optional, later) — Dual-ship generator

Only if pack edits resume. One source → helper + backend `.yar`. **Not** this epic’s default.

---

## 5) Conflict / garbage analysis (for reviewers)

| Fear | Reality |
|------|---------|
| WAF IDs vs Clam | Numeric vs `clam.*` vs `sinexis.php.*`. Separate ingest. |
| Needles become dead code | **No** — CI + boxes without CLI. Y1 **skips** needles only when CLI **succeeds**. |
| Double hits | Y1: exclusive needles XOR yara. Clam **additive** (different `rule_id`). Dedup key ignores engine. |
| Invalid YARA | Pack already has `condition: any of them`. Y1 still fail-closed to needles. |
| systemd vs clamd | Known S12 residual; C1. **Not** `ReadOnlyPaths=/run/clamav`. |
| Dual POST Clam | First POST can complete scan; Clam **replaces** `hit_count` — **C1 ingest MUST-FIX**. |
| `hit_class` `adminer` / `dropper` | Pack meta not in ingest enum (`webshell` / `backdoor` / `malware` / `spam_seo` / `suspicious`) → live POST **422**. Map helper: `dropper`→`malware`, `adminer`→`suspicious`. **Do not** expand DB check in this epic unless SPA wants new chips. |
| Tests | Tighten `engine` membership; mock subprocess; no new CI apt. |

---

## 6) Files likely to change (when implementing)

| Slice | Files |
|-------|--------|
| Y0 | helper `run()`; `backend/app/services/host_scan_runner.py`; `backend/tests/test_host_protect_helper.py` |
| C1 | helper `scan_clam` fallback + ingest `_finish_scan` additive; `docs/host-protect-helper-am.md`; systemd **only if** lab proves `/run/clamav`; tests mock clam stdout + dual POST |
| Y1 | helper `scan_yara_cli` + `rule \w+` in `load_signature_pack`; `hit_class` map; same tests; **not** `host_waf.py` |

Do **not** touch `host_waf_render.py` / `_WAF_STARTER_IDS` in these PRs.

---

## 7) Verification

- `pytest` helper + `test_host_engine.py` if engine labels exist there — CI image **without** clam/yara.
- Lab C1: tc5, jail fixture, Clam hit POST (no tokens/IPs in git).
- Lab Y1 optional.
- `lsp`/ruff on touched Python.

---

## 8) Agent notes

- English spec; Bahasa with user.
- `GIT_MASTER=1`; branch `feat/host-engine-honest-label` then `feat/host-clam-lab` then `feat/host-yara-cli` — **not** one mega-PR.
- Prefix every git command with `GIT_MASTER=1`.
- Do not implement G/H. Do not clone Imunify.
- Do not tell the user to SSH Alembic after green `main` deploy.

---

## 9) Success

AM can say: **ClamAV on the box** (if installed) posts `clam.*` hits; **YARA** means the CLI ran **our** pack; otherwise **needles** — never “yara” as a costume. Existing WAF starter and original `.yar` stay useful.

---

## 10) Review notes (2026-09-09)

| Reviewer | Verdict |
|----------|---------|
| **Oracle** | Conditional **APPROVE**. Slice order Y0→C1→Y1 correct. Do **not** implement CLI/systemd snippets from the first draft verbatim (`-C`, `yara -r`, `ReadOnlyPaths=/run/clamav`). MUST-FIX folded above. |
| **Momus** | Named `.sisyphus/plans/` copy was missing; reviewed this spec path. Executable: files exist; honesty bug matches code; slices have DoD. |
| **Librarian** | Official Clam: `--fdpass` = FILDES, Unix socket only. Production = `clamd`+`clamdscan`; `clamscan` loads CVD every run (fallback only). YARA: `-C` only on `yarac` output; `-s` not for cloud JSON; community packs GPL/DRL — **do not vendor**. |

**MUST-FIX before `kerjakan` Y1:** same walk + batched argv; no `-C` on source; additive Clam ingest; map `adminer`/`dropper`; no RO `/run/clamav` as the Clam “fix”; shared deadline.
