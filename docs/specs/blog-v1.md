# Spec: Public blog v1 (P10 — GTM content)

**Status:** **S0 draft** (this file). S1+ only after explicit implement.
**Goal:** public **Sinexis** articles (thought leadership / attach explainers) managed by **platform admin**, without a git PR per post.
**Epic:** **P10** (new). Does **not** replace P6 hospitality, P5 Guard, P7 SIEM, or P8 Uptime.
**Depends:** existing `User.is_admin` / `get_current_admin` · public SPA routes (Landing pattern) · i18n chrome catalogs · nginx SPA `try_files`.
**Commercial:** **not** a SKU. GTM/trust surface. Human still owns finance SIDs.
**Not this epic:** WordPress, comments, Next.js rewrite, legal `/terms` `/privacy`, org-tenant CMS.

**Q1–Q6 locked (user 2026-08-26):**

| # | Question | Locked |
|---|----------|--------|
| **Q1** | Index `/blog` in v1? | **Yes** — drop `X-Robots-Tag: noindex` **only** on `/blog` and `/blog/*` on **`sinexis.app`**. Dashboard, admin, login, `/api` stay noindex. |
| **Q2** | Canonical host? | **`https://sinexis.app/blog/:slug` only**. Legacy host must not compete (keep noindex or later redirect). |
| **Q3** | Who publishes? | **Platform `is_admin` only**. Org `admin` / hotel owner = **403**. No `author` role in v1. |
| **Q4** | Language model? | **One `locale` per row** (`id` \| `en`). Not dual columns. No `/en/blog` prefix. |
| **Q5** | Images? | **No upload**. No remote `img` in v1 (CSP `img-src 'self'`). Cover/OG = site default from `index.html` / brand. Markdown image syntax stripped or rejected on save. |
| **Q6** | Epic letter? | **P10**. P6 hospitality untouched. |

---

## 0) Relation to existing modules

| Surface | Job | Must not become |
|---------|-----|-----------------|
| **Landing** | Static marketing | CMS |
| **User Guide `/guide`** | Logged-in product help | Public blog |
| **Admin users/pricing** | Platform ops | Article store |
| **Workspace org admin** | Hotel/company membership | Blog publisher |
| **Guard / SIEM / Uptime** | Security product | Advisory CMS |

**Hard rules:**

1. **Global table** — no `organization_id` on posts.
2. **Do not** put public blog under `ProtectedRoute` / `AppShell`.
3. **Do not** reuse `/guide` content or `guide.json` as CMS.
4. **Do not** merge into Guard/SIEM/scan tables.
5. Public GET must be on **`EXCLUDED_PATHS`** (else anon 401 API key).
6. Write path = `Depends(get_current_admin)` + existing admin rate limit. **Not** `X-API-Key` as publisher.

---

## 1. Problem

| Today | Pain |
|-------|------|
| Landing copy is code | AM cannot publish attach/hospitality explainers without a deploy |
| Origin-wide `X-Robots-Tag: noindex` | No public thought-leadership URL even if we shipped HTML |
| No CMS tables | Content would otherwise live in git (PII/ops risk + slow) |

**Wedge B:** explain scheduled scan / SKU in Bahasa for colo/VPS buyers.
**Wedge A:** hospitality narrative pages — **copy only**, not P6 runbooks.

---

## 2. Goals

1. Platform admin CRUD posts: title, slug, excerpt, Markdown body, locale, status.
2. Public list + detail for **published** posts only (`status=published` and `published_at <= now()`).
3. Public `/blog` is a FastAPI **HTML island** with **Landing chrome** (BrandMark, `h-12`, tokens). SPA hydrate / language / theme not required in v1. Link from Landing.
4. Admin UI: `/admin/blog` under `AdminRoute` + Sidebar admin group.
5. Markdown source of truth; HTML via server sanitize (`nh3` or equivalent allow-list) on save/publish. No raw HTML persist as source.
6. SEO v1: FastAPI **HTML island** for `GET /blog` and `GET /blog/{slug}` (title, canonical, body text in first HTML). SPA may hydrate or sit behind the same URLs via nginx routing to backend for those paths.
7. Nginx: **path-scoped** robots override for `/blog` only on `sinexis.app`.
8. Tests: 403 non-admin write; anon list 200; draft slug **HTTP 404**; XSS payload stripped; unknown slug 404 (not 200 empty shell).
9. i18n **chrome** via `locales/{id,en}/blog.json`. Article body is **DB**, not catalogs.
10. Docs: this spek; **no** customer SID/domain/IP in fixtures or examples.

---

## 3. Non-goals (explicit)

| Out | Why |
|-----|-----|
| Next.js / full SSR rewrite | Out of attach SKU; HTML island is enough |
| Comments, reactions, newsletter | Abuse + ESP |
| WYSIWYG (TipTap/TinyMCE) | XSS + scope |
| Image upload / COS `blog/` / remote img | CSP + virus/storage |
| Tags, related posts, RSS in S1–S4 | Optional later |
| `organization_id` / org-admin CMS | Wrong tenancy |
| Locale prefix `/id/` `/en/` | Conflicts i18n-v1 §6.3 |
| Legal `/terms` `/privacy` | Cluster B still blocked |
| Guard/SIEM/Uptime FK or copy-from-alerts | Domain split |
| Lifting noindex for **entire** origin | Would index dashboards |
| Dynamic rendering (UA sniff) | Google anti-pattern |
| Seed posts with real customers | Public repo hygiene |
| Soft-delete column | Status `archived` is enough |

---

## 4. Defaults (locked)

| Topic | Default |
|-------|---------|
| Tenancy | Global; AuthZ write = platform `is_admin` |
| PK | UUID |
| Slug | `[a-z0-9]+(-[a-z0-9]+)*`, max 80, unique globally; **immutable after first publish** |
| Status | `draft` \| `published` \| `archived` |
| Public filter | `published` AND `published_at <= now()` |
| Draft preview | Admin session `/admin/blog` only; no public token query |
| Editor | Markdown textarea + admin preview (DOMPurify **preview only**) |
| Sanitize | `nh3` (or maintained allow-list) **on write**; store `body_md` + generated `body_html` |
| Feature flag | Optional `BLOG_ENABLED` default **true**; empty list is OK |
| Cache | Public GET `public, max-age=60, s-maxage=300` + ETag; admin `no-store` |
| Sitemap | `GET /blog/sitemap.xml` published slugs only (S4/S5) |
| Brand | Sinexis `BrandMark`; do not re-do P4 |

---

## 5. Data model

Table `blog_posts`:

| Column | Notes |
|--------|--------|
| `id` | UUID PK |
| `slug` | unique, indexed |
| `title` | text, required |
| `excerpt` | text, short, required for list cards |
| `body_md` | text, required |
| `body_html` | generated sanitized HTML, not edited by client |
| `locale` | `id` \| `en` |
| `status` | check constraint |
| `published_at` | timestamptz nullable; set on first publish |
| `author_user_id` | FK users ON DELETE SET NULL |
| `created_at` / `updated_at` | standard |

Indexes: unique `slug`; `(status, published_at DESC)` for list.

Unpublish: set `status=archived` or `draft`; public URL **404**; drop from sitemap. Short cache TTL so unpublish is visible in minutes.

---

## 6. API

**Admin** (JWT + `get_current_admin`), prefix `/api/admin/blog`:

- `GET /posts` — all statuses, paginated
- `POST /posts` — create draft
- `GET /posts/{id}` — by UUID
- `PATCH /posts/{id}` — update; reject slug change if ever published
- `POST /posts/{id}/publish` — status published, set `published_at` if null, regenerate HTML
- `POST /posts/{id}/unpublish` — draft or archived

**Public** (no JWT, no API key) — must be **`EXCLUDED_PATHS`**:

- `GET /api/blog/posts?locale=&page=` — published only; **no** `body_md` in list (excerpt + title + slug + published_at + locale)
- `GET /api/blog/posts/{slug}` — published detail; `body_html` sanitized; **404** if draft/unknown

Do **not** expose draft by UUID on the public router.

**HTML island** (S4, Q1):

- `GET /blog` and `GET /blog/{slug}` from **backend** (or nginx `location /blog` → backend) returning HTML with `<title>`, canonical `https://sinexis.app/blog/{slug}`, article text. Unknown slug → **404** status, not SPA 200.

---

## 7. SPA sketch

**Public** (`App.tsx` public block, no AppShell):

- `/blog` — `data-testid="blog-list"`
- `/blog/:slug` — `data-testid="blog-article-title"`
- Landing header + “Blog” nav link
- Empty: i18n “Belum ada artikel”

**Admin** (`AdminRoute`):

- `/admin/blog` — table + editor `data-testid="admin-blog-editor"`
- Sidebar item only if `user.is_admin`

If HTML island owns `/blog`, keep React routes for local Vite **or** document that prod HTML is server-rendered and SPA is admin-only. Prefer **one** public URL owner in prod: **backend HTML** for SEO; Vite dev may still use SPA against public JSON API.

---

## 8. Nginx / SEO / CSP

- Today: `nginx/sinexis.app.conf` site-wide noindex.
- S4: `location /blog` { proxy backend; **do not** send noindex }. All other locations unchanged.
- `vs.appmedia.id` (if still live): keep noindex **or** `Link` canonical to sinexis.app — do not double-index.
- CSP: do **not** widen `script-src` for article HTML. No `img-src https:` in v1.
- Soft 404 forbidden: crawler must see HTTP 404 for unknown slugs.

---

## 9. Abuse, XSS, ops

- Rate-limit public list (existing limiter pattern).
- Markdown only; strip `javascript:` links; no raw `<script>`, `<iframe>`, `on*=`.
- Pytest: POST body containing `<script>alert(1)</script>` → public GET HTML must not contain literal `<script>`.
- No PII/IPs in seed. Example slug for tests: `scan-attach-upsell`, title `Mengapa scan berkala`, body `# Halo`.
- Unpublish + cache: TTL 60s; accept residual stale ≤ 5 min (`s-maxage`).

---

## 10. Slices (implement only after explicit verb)

| Slice | Deliverable | Depends |
|-------|-------------|---------|
| **S0** | This spek + guide/handoff P10 pointer | — **this file** |
| **S1** | Model + Alembic + admin CRUD API + AuthZ + slug rules | S0 |
| **S2** | Public JSON GET + `EXCLUDED_PATHS` + published filter + 404 draft | S1 |
| **S3** | SPA `/admin/blog` + i18n `blog` ns + Markdown editor | S1 |
| **S4** | Public `/blog` HTML island + nginx robots path + Landing link + sitemap | S2 |
| **S5** | `nh3` on write, cache headers, XSS tests, ops note | S2–S4 |

Default order: **S0 → S1 → S2 → S3 ∥ S4 after S2 → S5**.
S3 (admin UI) can parallel S2 after S1. S4 needs public JSON **or** can render from DB directly in FastAPI.

---

## 11. Acceptance (after implement — agent-executable)

Replace `$BASE` with public origin (no secrets).

- [ ] `curl -sS -o /dev/null -w "%{http_code}" $BASE/api/blog/posts` **without** `Authorization` → `200`
- [ ] Create draft as admin; `curl …/api/blog/posts/scan-attach-upsell` → `404`
- [ ] Publish; same URL → `200`; list contains slug
- [ ] `curl -sS -X POST $BASE/api/admin/blog/posts -H "Authorization: Bearer $USER_JWT"` (non-admin) → `403`
- [ ] XSS: published HTML/JSON `body_html` has no `<script>`
- [ ] `curl -sS $BASE/blog/scan-attach-upsell` HTML contains `<title>` and body text **without** JS; `X-Robots-Tag` on `/blog` **not** noindex; `/dashboard` still noindex
- [ ] Unknown slug `GET /blog/no-such-post` → **404**
- [ ] Playwright: public `blog-list`; admin `admin-blog-editor`; public e2e `storageState` empty cookies
- [ ] Scan/Guard/SIEM/Uptime tables untouched
- [ ] No customer URLs/IPs/PII in git

---

## 12. Open residual (not blocking S0)

- Exact nginx snippet on edge (ops, no IPs in git).
- Whether Vite SPA also mounts `/blog` in prod or HTML island is sole owner (prefer backend owner in prod).
- RSS later (out of S1–S4).

---

## 13. References

- Guide §1.3 P10; §4 git/deploy; §8 public vs private
- [`i18n-v1.md`](i18n-v1.md) — chrome catalogs; no `/en/` prefix
- Admin: `backend/app/api/admin_routes.py`, `get_current_admin`, `AdminRoute`, `AdminUsers.tsx`
- Public: `frontend/src/pages/Landing.tsx`, `App.tsx` public block
- Middleware: `EXCLUDED_PATHS` in `backend/app/middleware/auth.py` / `main.py`
- Nginx: `nginx/sinexis.app.conf` (do not paste secrets)

---

*S0 locked 2026-08-26. Do not implement S1+ until the user says implement / buat / kerjakan.*
