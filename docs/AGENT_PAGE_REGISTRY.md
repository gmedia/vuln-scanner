# Agent page registry

**Purpose:** After session reset, know **every user-facing URL**, who owns it (SPA vs FastAPI HTML), auth, chrome, and where to recapture / e2e. Source of truth for **routes** is `frontend/src/App.tsx` plus FastAPI HTML routers. This file is a **map**, not a backlog — epic order still [`AGENT_EXECUTION_GUIDE.md`](AGENT_EXECUTION_GUIDE.md).

**Last updated:** 2026-08-30
**Do not** put production hosts/ports, emails, passwords, enroll keys, or customer IPs here.

---

## How to use

| Need | Do |
|------|----|
| Visual QA / screenshots | Recapture **SPA** on public origin after deploy; **HTML islands** (`/blog`, `/terms`, `/privacy`, `/status/{slug}`) are **not** React — Playwright on SPA origin may miss them if nginx routes to backend. |
| New page | Add a `Route` in `App.tsx` **and** a row here in the same PR. Sidebar: `frontend/src/components/layout/Sidebar.tsx`. |
| Auth | `ProtectedRoute` → JWT; unauthenticated → `/login` (invite query preserved). `AdminRoute` → `user.is_admin` else `/dashboard`. |
| Design | Guide **§10** + `AGENTS.md`. Public HTML must **rhyme Landing**, not a second editorial skin. SPA: kit only; no native `<select>`. |
| Flags | Backend 404 / empty when off. SPA still **routes** `/siem` and `/uptime` even if API is flag-off — do not assume nav hide. |

**Chrome families**

| Family | Wrapper | Typical width |
|--------|---------|----------------|
| **Landing** | No AppShell | `max-w-6xl` / `2xl:max-w-[90rem]`, `h-12` header, BrandMark |
| **Auth** | No AppShell | Auth cards, same tokens |
| **App** | `ProtectedRoute` + `AppShell` | Sidebar + `2xl:max-w-[90rem]` main |
| **HTML island** | FastAPI `_shell` in `blog_html.py` | Landing-like header/footer; **no** ThemeSwitcher / i18n hydrate |

---

## A. Public SPA (no AppShell)

| Path | Page file | Auth | Notes | Tests |
|------|-----------|------|-------|-------|
| `/` | `pages/Landing.tsx` | Public | Hero, pipeline, 9 feature cards, FAQ Accordion (triggers are **buttons**, not `h3`). | `src/test/Landing.test.tsx`, `e2e/landing.spec.ts` |
| `/login` | `pages/Login.tsx` | Public | Invite query `?invite=` | `Login.test.tsx`, `e2e/auth-flow.spec.ts` |
| `/register` | `pages/Register.tsx` | Public | | `Register.test.tsx`, `e2e/auth-flow.spec.ts` |
| `/verify-email` | `pages/VerifyEmail.tsx` | Public | Token in query | `VerifyEmail.test.tsx`, `e2e/verify-email.spec.ts` |
| `/forgot-password` | `pages/ForgotPassword.tsx` | Public | | `ForgotPassword.test.tsx`, `e2e/forgot-password.spec.ts` |
| `/reset-password` | `pages/ResetPassword.tsx` | Public | Token in query | `ResetPassword.test.tsx`, `e2e/reset-password.spec.ts` |
| `*` | `pages/NotFound.tsx` | Public | Catch-all **after** protected tree; unknown SPA paths | `e2e/not-found.spec.ts` |

---

## B. App SPA (AppShell)

Nav groups match Sidebar: **Scan** · **Attach** · **Account** · **Admin** (admin only).

### Scan

| Path | Page file | Nav | Notes | Tests |
|------|-----------|-----|-------|-------|
| `/dashboard` | `pages/Dashboard.tsx` | Scan | Home after login | `e2e/dashboard.spec.ts` |
| `/scan/ip` | `pages/IpScanner.tsx` | Scan | Two-column form + coverage | `IpScanner.test.tsx`, `e2e/ip-scanner*.spec.ts` |
| `/scan/domain` | `pages/DomainScanner.tsx` | Scan | Same layout family as IP | `DomainScanner.test.tsx`, `e2e/domain-scanner*.spec.ts` |
| `/scan/mobile` | `pages/MobileScanner.tsx` | Scan | Upload APK/AAB/IPA | `MobileScanner.test.tsx`, `e2e/mobile-scanner*.spec.ts` |
| `/scan/:id` | `pages/ScanDetail.tsx` | — | Job detail; not in sidebar | `ScanDetail.test.tsx`, `e2e/scan-detail.spec.ts`, `e2e/export.spec.ts` |
| `/schedules` | `pages/Schedules.tsx` | Scan | Attach loop | `Schedules.test.tsx` |
| `/assets` | `pages/Assets.tsx` | Scan | `data-testid=nav-assets` | `Assets.test.tsx` |
| `/host` | `pages/HostProtect.tsx` | Scan | Host Protect (malware + WAF tabs). Flag `HOST_PROTECT` / `HOST_WAF`. Not Guard enroll. | `HostProtect.test.tsx` |

### Attach / product

| Path | Page file | Nav | Notes | Tests |
|------|-----------|-----|-------|-------|
| `/guard` | `pages/Guard.tsx` | Attach | Thin Wazuh. **Playwright ≠ enroll/unenroll.** Live lab: wipe `tc5` first (guide §4.1). | `GuardHostEnroll.test.tsx`, `e2e/guard.spec.ts` |
| `/siem` | `pages/Siem.tsx` | Attach | Flag `SIEM_ENABLED` (default false). Do not merge into Guard. | `Siem.test.tsx`, `e2e/siem.spec.ts` |
| `/uptime` | `pages/Uptime.tsx` | Attach | `end: true` so `/uptime/status-page` is not “active” on Uptime. Flag `UPTIME_ENABLED`. | `Uptime.test.tsx`, `e2e/uptime.spec.ts` |
| `/uptime/status-page` | `pages/StatusPage.tsx` | Attach | **Editor** (auth). Public view is HTML `/status/{slug}`. Never leak URL/IP/headers/token on **public** status. | `StatusPage.test.tsx` |
| `/guide` | `pages/UserGuide.tsx` | Attach | In-app guide | `UserGuide.test.tsx` |

### Account

| Path | Page file | Nav | Notes | Tests |
|------|-----------|-----|-------|-------|
| `/credit-history` | `pages/credit/CreditHistory.tsx` | Account | **Filter-bar reference** (equal `gap-3`, `h-10`) | `e2e/credit-history.spec.ts` |
| `/profile` | `pages/Profile.tsx` | Account | | `Profile.test.tsx`, `e2e/profile.spec.ts` |
| `/settings/workspace` | `pages/WorkspaceSettings.tsx` | Account | Org members, invites, P6 pilot checklist | `WorkspaceSettings.test.tsx` |
| `/org/members` | **same** `WorkspaceSettings.tsx` | — | Alias route; keep in sync | same |

### Admin (`AdminRoute`)

| Path | Page file | Nav | Notes | Tests |
|------|-----------|-----|-------|-------|
| `/admin` | `pages/admin/AdminDashboard.tsx` | Admin | `end: true` | `admin/AdminDashboard.test.tsx`, `e2e/admin.spec.ts` |
| `/admin/users` | `pages/admin/AdminUsers.tsx` | Admin | | `admin/AdminUsers.test.tsx`, `e2e/admin-users.spec.ts` |
| `/admin/users/:id` | `pages/admin/AdminUserDetail.tsx` | — | | `admin/AdminUserDetail.test.tsx`, `e2e/admin-user-detail.spec.ts` |
| `/admin/pricing` | `pages/admin/AdminPricing.tsx` | Admin | Credit `credit_cost` per scan type + `statushost`. **Not** IDR COGS. | `admin/AdminPricing.test.tsx` |
| `/admin/hpp` | `pages/admin/AdminHpp.tsx` | Admin | IDR unit rates + monthly overhead + cost journal + date-range report + SKU overlay **estimasi**. Not mixed with Pricing. `nav-admin-hpp`. Spec: `docs/specs/admin-hpp-v1.md`. | `admin/AdminHpp.test.tsx` |
| `/admin/blog` | `pages/admin/AdminBlog.tsx` | Admin | CMS; `nav-admin-blog`. Locale key `blogStatus`. | `admin/AdminBlog.test.tsx` |

---

## C. FastAPI HTML islands (not React)

Served by backend; nginx must **not** send these to the SPA. Chrome: Landing rhyme (`blog_html._shell`). Tokens in `_SHELL_CSS` — keep in sync with `frontend/src/index.css` `:root` when changing brand color.

| Path | Router | Flag | Notes | Tests |
|------|--------|------|-------|-------|
| `/blog` | `app/api/blog_html.py` | `BLOG_ENABLED` | Index; also `/blog/`; one `h1` even if empty | `backend/tests/test_blog.py` |
| `/blog/{slug}` | same | `BLOG_ENABLED` | Article; slug `sitemap.xml` reserved | same |
| `/blog/sitemap.xml` | same | `BLOG_ENABLED` | XML | same |
| `/terms` | `app/api/legal_html.py` | — | Legal; Landing footer links | `backend/tests/test_legal_html.py` |
| `/privacy` | same | — | Legal | same |
| `/status/{slug}` | `app/api/status_html.py` | `STATUS_PAGE_ENABLED` | **Public** status. No target URL/IP/headers/token in HTML. | `backend/tests/test_status_page.py`, `StatusPage.test.tsx` |
| `/status` | same | `STATUS_PAGE_ENABLED` | Host-based; **404** on platform hosts (`sinexis.app`, `www`, `vs.appmedia.id`, `status-edge` / `customers.sinexis.app`, localhost) | same |
| `/` (custom status host only) | same `status_root_by_host` | `STATUS_PAGE_ENABLED` | Apex on **non-platform** Host (e.g. customer hostname). Same 404 rules as `/status`. Not the SPA landing. | same |

JSON APIs (`/api/...`) are **not** pages — do not screenshot.

---

## D. Visual QA recapture set (SPA)

Minimum authenticated set (2k + mobile, light + dark) after a chrome/token change. Skip HTML islands unless the island CSS/`_shell` changed.

1. `/` (logged out)
2. `/login`
3. `/dashboard`
4. `/scan/ip` `/scan/domain` `/scan/mobile`
5. `/schedules` `/assets` `/host`
6. `/guard` `/siem` `/uptime` `/uptime/status-page`
7. `/credit-history` `/profile` `/settings/workspace` `/guide`
8. Admin: `/admin` `/admin/users` `/admin/pricing` `/admin/hpp` `/admin/blog`

Auth for prod visual: `E2E_EMAIL` / `E2E_PASSWORD` from **tc1 env** — never commit. Do not `POST /register` for the shared mailbox.

**Do not** git-add recapture PNGs or `.tmp-*`.

---

## E. When this file is stale

If `App.tsx` has a `path=` missing from tables A–B, or an HTML `@html_router.get` missing from C, **update this file in the same PR** as the route.

Pointer from session boot: [`AGENT_EXECUTION_GUIDE.md`](AGENT_EXECUTION_GUIDE.md) §0 / §9.
