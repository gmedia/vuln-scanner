# Spec: Status custom hostname lifecycle (P11.x)

**Status:** Draft — **docs only**. **Do not implement** until an explicit implement verb (`implement` / `buat` / `kerjakan`) **and** this spec is named.
**Goal:** Make custom hostname onboarding **understandable** (buttons + states) and **operable** (TXT + CNAME, poll Cloudflare — not CNAME-only `dig`). Meter credits and CF API create/delete are **later slices**, not this file’s first implement.
**Epic:** **P11.x** follow-on to [`status-page-v1.md`](status-page-v1.md). Does **not** replace Uptime probes, Scan, Guard, or SIEM.
**Depends:** P11 S1–S5 tables (`custom_hostname`, `hostname_status`); Cloudflare for SaaS on zone `sinexis.app`; origin nginx custom-host apex (PR #464).
**Commercial:** still **not** a list-price SKU. Custom host remains **Multi** until a later meter slice. **Do not** hardcode “3 credits / month” in product copy.
**Not this epic (first implement):** Cloudflare API token in app, auto-create hostname, credit debit, CNAME-to-this-zone as the only validation method, opening origin `:443` to the internet, ACME in-app.

---

## 0) Relation to v1 (read first)

| Surface | Today (`main`) | This spec |
|---------|----------------|-----------|
| Save page | `PATCH` title / slug / published | **Unchanged** — never touches CF |
| Custom host field | Same card as **Save** + **Verify DNS** | Split actions: **Pasang** / **Perbarui** / **Lepas** / **Cek status** |
| Verify | App `dig` CNAME vs `STATUS_PAGE_CNAME_TARGET` | **Poll Cloudflare hostname status** (TXT + SSL). CNAME-only is **insufficient** (customer zone often not on Cloudflare) |
| States | `none` \| `pending_dns` \| `active` \| `failed` | Rename conceptually to **`none` → `pending_txt` → `active` → `failed` \| `suspended`**. Keep DB migration explicit |
| Public URL | Platform `/status/{slug}`; custom host **apex `/`** after #464 | Unchanged |
| TLS | Human creates CF SaaS hostname | Later slice: API create; **this spec** still allows human CF + UI showing records |

**Hard rules:**

1. **Simpan halaman** (slug/title/publish) **must not** create or delete a Cloudflare hostname.
2. Validation method for customer zones **not** on Cloudflare: **TXT** (`ssl.method = txt`). Do **not** productize CNAME-to-this-zone as the happy path.
3. Customer CNAME target is **`customers.sinexis.app`** (SaaS) or documented fallback `status-edge.sinexis.app` — **never** an origin A record.
4. Do **not** put CF API tokens, customer hostnames from live labs, or origin IPs in git.
5. Frozen e2e testids stay: `status-page`, `status-page-host`, `status-page-publish`, `status-page-create`, `status-page-slug`, `status-page-save-slug`. New buttons get **new** testids.
6. Public HTML must **never** include CF TXT tokens, origin IPs, or monitor URLs.

---

## 1. Problem

Operators can type a hostname and click **Save** / **Verify DNS**. That mixes three jobs and fails for real customer DNS:

| Gap | Pain |
|-----|------|
| One **Save** for page + hostname | Unclear whether Cloudflare was touched |
| **Verify DNS** = CNAME `dig` | TLS stays pending until **TXT** exists; CNAME-to-zone fails off-Cloudflare |
| Status enum `pending_dns` | Implies “CNAME only”; SSL/TXT is the real gate |
| No **Lepas** | Clearing the field is a silent PATCH, not unenroll |
| Credits idea (3/mo) | No cycle, no “bill on Active”, easy to charge before TXT |

---

## 2. Goals (first implement = UX + state machine in app)

1. **State machine** on `status_pages.hostname_status` (see §4).
2. **Separate buttons** (see §5) + i18n `id`/`en`.
3. **Instruction card** when status is `pending_txt`: CNAME + TXT name/value (copy), disclaimer that Sinexis does **not** edit the customer’s zone.
4. **Cek status** polls **Cloudflare Custom Hostname** (read API or ops-fed cache) — not only `dig`.
5. Tests: IDOR on hostname PATCH; platform Host still SPA; custom host public HTML only when `published` + `active`; copy keys exist.
6. Docs: this file; pointer from `status-page-v1.md`. **No** customer FQDNs as examples in tests beyond `example.com` / `status.example.com`.

**Out of first implement (named later):**

| Slice | When |
|-------|------|
| **P11.x-B** CF API **create/delete** hostname on Pasang/Lepas | After UX states exist; token only on deploy host |
| **P11.x-C** Meter: `N` credits / active hostname / calendar month; `N` from admin pricing; charge on **Active**, not on Save | After 1–2 live hostnames; grace before suspend |

---

## 3. Non-goals (explicit)

| Out | Why |
|-----|-----|
| Hardcode 3 credits in UI | Pricing knob belongs in admin; margin vs CF SaaS unknown |
| Charge on **Save** / `pending_txt` | Customer has not received TLS yet |
| Delete CF hostname on first failed payment | Need grace; ops residual |
| CNAME-only verify as success | Already failed for non-CF customer zones |
| Auto-open origin firewall | SaaS edge only |
| Multiple custom hosts per org in v1 | Still 1 page / 1 hostname |
| ACME inside the container | Edge TLS |

---

## 4. State machine

```
none ──Pasang──► pending_txt ──CF Active──► active
                      │                      │
                      └──CF error──► failed  │
                                             ├──Lepas──► none
                                             └──unpaid (later)──► suspended ──pay──► active
```

| State | Meaning | Public custom apex |
|-------|---------|-------------------|
| `none` | No hostname (or cleared) | 404 / not served |
| `pending_txt` | Hostname stored; waiting TXT and/or SSL | **Must not** serve (avoid half-TLS) |
| `active` | CF hostname **Active** + published | Serve status HTML at `/` |
| `failed` | CF error / validation timeout | Must not serve |
| `suspended` | Later meter only | Must not serve |

**Migration:** map existing `pending_dns` → `pending_txt`. Keep check constraint in Alembic.

**Transitions (first implement, no CF write API):**

| Action | From | To | Side effect |
|--------|------|-----|-------------|
| Pasang domain | `none` | `pending_txt` | Store FQDN; **do not** debit credits |
| Cek status | `pending_txt` / `failed` | `active` or `failed` | Read CF (or documented stub in CI) |
| Perbarui domain | any with hostname | `pending_txt` (new name) | Old name no longer unique; confirm dialog |
| Lepas domain | any | `none` | Null hostname; later slice deletes CF object |

CI without CF: stub returns `pending_txt` unless `STATUS_PAGE_CF_STUB_ACTIVE=1`.

---

## 5. Buttons and copy (SPA `/status`)

**Page card (unchanged job):** Publish / Unpublish, **Save public URL** (slug only).

**Hostname card — mutually exclusive primary:**

| Condition | Primary | Secondary |
|-----------|---------|-----------|
| Field empty, `none` | **Pasang domain** / **Attach domain** | — |
| Draft ≠ saved hostname | **Perbarui domain** / **Update domain** | Cancel |
| Saved hostname, not `none` | **Cek status** / **Check status** | **Lepas domain** / **Remove domain** |

Do **not** label hostname PATCH as **Save**. Toast on Pasang: “Domain saved. Add CNAME and TXT at your DNS host — Sinexis does not manage that zone.”

**Instruction card (`pending_txt`):**

1. CNAME `status.example.com` → `customers.sinexis.app` (or `cname_target` from API).
2. TXT record from CF (name + value) — placeholder in first implement if no API yet: “Create the Custom Hostname in Cloudflare for SaaS (TXT method), then paste is not required; click Check status.”
3. One line: **Do not** point A/AAAA at the origin.

Help text replacement for `cnameHelp`: drop “then verify DNS” as if CNAME were enough.

---

## 6. API (first implement)

Keep `PATCH /api/status-page` for slug/title/published.

**Prefer new endpoints** (do not overload PATCH for CF):

| Method | Path | Role |
|--------|------|------|
| `POST /api/status-page/hostname` | Pasang (body `{hostname}`) | member+ |
| `PUT /api/status-page/hostname` | Perbarui | member+ |
| `DELETE /api/status-page/hostname` | Lepas | member+ |
| `POST /api/status-page/hostname/check` | Cek status (poll CF) | member+ |

SKU: still **400** if org not `multi` (same as v1). Viewer: 403 mutate.

Response adds optional `txt_name`, `txt_value`, `ssl_status` (never log values at info in prod).

---

## 7. Credits (P11.x-C — do not implement with first PR)

- Admin pricing key e.g. `status_hostname_monthly` default **unset** (treat as 0 until finance sets N).
- Debit when entering **`active`**, then calendar month while `active`.
- Do **not** debit `pending_txt`.
- Insufficient credits: stay `pending_txt` or move `active` → `suspended` after **grace** (default 7 days) — grace is a later lock.

---

## 8. Tests

- Pasang does not change `published`.
- Custom host HTML 404 unless `active` + `published`.
- Platform `Host: sinexis.app` GET `/` not status HTML.
- IDOR: other org cannot Pasang same hostname (unique constraint).
- i18n keys for Attach / Update / Remove / Check status.
- No `3 credit` string in locales until x-C.

---

## 9. Docs / ops

- This file; one paragraph in `status-page-v1.md`.
- Execution guide: “tulis spek hostname status” → this file; implement only when named.
- Host nginx apex: [`nginx/sinexis.app.conf`](../../nginx/sinexis.app.conf) after #464 merge — deploy is **ops**, not this spec.

---

## 10. Open questions (do not block first implement)

1. Exact CF API field names for TXT (lock in x-B).
2. Value of N credits (finance).
3. Pro tier: 0 vs 1 paid hostname (default: Multi only until x-C).
