# Spec: Capacitor shell v1 (optional phone surface)

**Status:** engineering spec — **do not implement** until the user explicitly says implement / kerjakan / buat **and** `docs/AGENT_EXECUTION_GUIDE.md` names this surface (it is **not** Scan P0–P5).
**Goal:** wrap the **existing Vite SPA** (`frontend/`) as an Android + iOS store binary **without rewriting UI in Flutter/RN**, so operators can install an icon that opens the same dashboard.
**Non-goals:** Flutter/Kotlin+Swift UI clone; new SKU or in-app billing; Guard enroll from the phone; treating `POST /api/scan/mobile` (APK/IPA analysis) as this client; SIEM/Host Protect as v1 differentiators; putting Play/APNs secrets in this public repo; changing `scripts/deploy.sh` / compose to build APKs; shipping push/`device_tokens` in the same epic as the shell.

**Priority:** **parked** relative to GTM + Scan attach. Email notify on new critical/high remains the attach notify path. This spec exists so a later “implement capacitor” instruction has a single source of truth.

**Oracle review (2026-09-03):** **REVISE** applied — CORS vs CapacitorHttp, refresh persistence, `X-E2E-Test`, `allowNavigation`, C3 schema stripped, Docker ignore native trees. Do not implement because this file exists.

---

## 1. Problem

The SPA already is the product UI (`/dashboard`, schedules, Guard thin alerts, credits). A **native rewrite** duplicates shadcn tokens, i18n (`src/locales/{en,id}/`), and auth. Review (Oracle + architecture, 2026-09-03) **rejected Flutter** as a current epic.

What a phone might still need:

1. Home-screen **icon** (store or PWA)
2. Optional **push** later (greenfield — no FCM/APNs in backend today) — **separate spec**
3. **Reuse** `frontend/src/**` rather than a second design system

Capacitor is a **WebView shell** around the Vite **bundled** `dist`, not a new app framework and **not** a production remote URL.

---

## 2. Decision: wrap modes (pick one before coding)

Official Capacitor (`server.url`): **“Load an external URL in the WebView. Intended for live-reload. Not for production.”** Do **not** ship store binaries with `server.url` / `cleartext` committed.

| Mode | What ships | Auth | When |
|------|------------|------|------|
| **A. Bundled SPA (production Capacitor)** | `vite build` → `webDir: dist`; `npx cap sync`; **omit** `server.url` | WebView origin is `https://localhost` (Android) or `capacitor://localhost` (iOS) — **cross-site** to `sinexis.app`. Cookie `SameSite=strict` **will not** attach. Use **Bearer + refresh JSON body**. WebView `fetch`/`axios` **is CORS**. Do **not** add Capacitor origins to prod `CORS_ORIGINS`. C2 **enables CapacitorHttp** so CORS stays closed. Do **not** set `server.hostname` to the API host to fake first-party cookies. | Only if Play/App Store (or later native push) is mandatory |
| **A-dev. Live reload** | `server.url` = LAN Vite (`http://x.x.x.x:5173`), `cleartext: true` | Dev only | Local; **never commit** |
| **B. Icon-only PWA** | No Capacitor; web `manifest` + `apple-touch-icon` | Same as Chrome; cookies work | **Parked default** if the ask is an icon |
| **C. Rejected: prod `server.url`** | Remote `https://sinexis.app` inside Capacitor | Looks like a browser | **Out.** Violates Capacitor production guidance |

**v1 recommendation:** **B (PWA / C1)** if the ask is only an icon; **A (bundled / C2)** only if store listing is mandatory. Not Flutter. Not prod `server.url`. **Parked default remains C1.** Do not start C2 because this file exists.

SPA Vite already binds `server.host: 0.0.0.0` (good for A-dev). Set `webDir` to **`dist`** yourself — CLI guesses CRA `www`/`build`, not Vite.

---

## 3. Actors & tenancy

Same as SPA: JWT user + `org_id` on access token; `POST /api/orgs/switch` re-issues access **and** refresh. Viewer = read-only (no start scan, no Guard enroll, no schedule mutate).

**Never** put global `X-API-Key` in the app binary (guide §1.4).

Platform `user.is_admin` must not unlock `/admin/*` affordances beyond what the SPA already gates.

---

## 4. Repo & CI layout

**Source of UI:** this repo, `frontend/` only.

```
frontend/
  src/                 # unchanged product UI
  capacitor.config.ts  # webDir: dist; appId TBD (not a secret)
  android/             # commit IF C2 lives in this public repo; else private sibling — not both policies
  ios/
```

**Commit policy (pick one, not both):**

- **Public repo C2:** commit `android/` and `ios/` (they **are** the native app). Gitignore `Pods/`, `build/`, local IDE — **not** the whole trees.
- **Policy forbids native trees:** keep `capacitor.config.ts` + this spec here; `android/`/`ios/` in a **private sibling** that consumes `frontend` build artifacts.

**Do not:**

- Add Flutter
- Mount `android/` in `docker-compose*.yml`
- Add Gradle/Xcode as a job on `.github/workflows/ci.yml` (including the `deploy` job)
- Store `google-services.json`, APNs `.p8`, upload keystores in git
- Run `cap sync` / `cap copy` from Docker or `frontend` `npm run build`
- Let `frontend/Dockerfile` `COPY . .` ingest native trees — **`frontend/.dockerignore` must exclude `android/` and `ios/`**

**CI:** **new** workflow file (`workflow_dispatch` and optional `paths`). Not a job on `ci.yml`. Do not overload `skip_deploy` (that input belongs to the existing CI/CD workflow).

---

## 5. Capacitor config (intent)

- `appId`: reverse-DNS, public (e.g. `app.sinexis.console`) — confirm with owner before store accounts
- `appName`: **Sinexis** (soft dual-brand; not “VulnScanner” as store title unless legal says so)
- `webDir`: **`dist`** (Vite outDir; must contain `index.html` with `<head>` for plugin inject)
- Production: **no** `server.url` / `cleartext`. Live-reload only on a local uncommitted override
- `androidScheme`: keep **`https`** (Chrome WebView 117+ path bugs if custom schemes)
- Production: **omit** `server.allowNavigation` (Capacitor: not for production). API only via XHR/CapacitorHttp. Non-app URLs → system browser
- **No TLS pinning** in v1
- Capacitor **7 docs frozen**; implement against **current stable (v8 as of research)** unless owner pins 7

Init lives in **`frontend/`** (`npx cap init` there), not repo root (avoids `android/` next to `docker-compose.yml`).

Capacitor **build is a different artifact** from the Docker SPA: bake absolute `VITE_API_URL` + `wss://` **only** in the Capacitor flavor. Docker SPA stays same-origin / empty `VITE_API_URL`.

---

## 6. Auth (the actual work)

Today:

- Access JWT ~30 minutes; refresh 7 days; **JTI rotation** on `POST /api/auth/refresh`
- JSON body already includes `refresh_token`; cookie is extra for SPA (`HttpOnly`, `SameSite=strict`, `path=/api/auth`, `secure` default true)
- SPA scan client: `Authorization: Bearer` from `authStore`; `authApi` also `withCredentials: true`
- Login currently often **stores only accessToken**; refresh then relies on **cookie or empty body** — that **fails** in Mode A
- Org switch **does** write `refreshToken` today
- Authenticated API budget: **~300 req/hour/IP** (SPA does **not** poll dashboard). Carrier **CGNAT** shares the bucket with the desktop SPA
- `frontend/src/api/scans.ts` currently sets **`X-E2E-Test: true` on every request** (Playwright bypass, no shared secret) — **must not** ship in Capacitor or production SPA bundles

**Mode A (required for store builds):**

1. On **login**, **Google login**, and **org switch**, persist **both** access and refresh in a **secure-storage plugin** (not Preferences, not localStorage for refresh). Cookie refresh **will fail** in the WebView.
2. Refresh **always** JSON `{ "refresh_token" }`; never empty body. One in-flight refresh; honor 429 `Retry-After`; login 5/min/IP, refresh 10/min/IP.
3. Logout: `POST` revoke or logout-all, then delete native tokens. Do not “refresh then drop” (that rotates JTI and leaves a live refresh).
4. Absolute `VITE_API_URL` **and** `wss://` for `/ws/scan/{id}` in the **Capacitor** build only.
5. **Never** send `X-E2E-Test` from Capacitor or production SPA (`scans.ts` always-on header is a **C2 prerequisite fix**, also correct for web prod).
6. Google Sign-In in WKWebView/Chrome WebView is **best-effort**; **password login must work**. Native Google plugin is optional later.
7. Enable **CapacitorHttp** so CORS stays closed. DoD is **not** “add origins to `CORS_ORIGINS`.”

CORS is **in scope** unless CapacitorHttp is on. Do not allowlist `https://localhost` or `capacitor://localhost` in production.

APK/IPA **upload** remains existing SPA (`POST /api/scan/mobile` = analysis of a file, **not** this client). Capacitor may need the Filesystem/file-picker plugin for large multipart; that is inherited SPA behavior.

---

## 7. Dashboard + “notifications” v1 (no new screens)

**Reuse SPA routes.** No Dart widgets. Home = existing `/dashboard`.

Do **not** add a 5-endpoint poller “because mobile.” Rate limit is shared per IP with the web app. WS reconnect/heartbeat on a scan page also counts — no extra Capacitor sync loop.

In-app “alerts” = existing Guard list in SPA (`GET /api/guard/alerts`), hidden/degraded on 503 if `GUARD_ENABLED` false. **No** `/api/features` today — probe like SPA.

Email `notify_email` on schedules **stays**. Capacitor v1 does **not** replace email.

---

## 8. Slices (separate PRs; do not number as product P0–P5)

| Slice | Deliverable | Depends |
|-------|-------------|---------|
| **C0 Guide gate** | One paragraph in `AGENT_EXECUTION_GUIDE.md`: parked; implement only on explicit verb | Owner |
| **C1 PWA** | Web manifest + `start_url` (auth gate to `/dashboard`) + icons; not Capacitor | — |
| **C2 Bundled Capacitor** | `@capacitor/core`+cli in `frontend/`; `webDir: dist`; `cap add android/ios`; CapacitorHttp; Bearer+body refresh in secure storage; absolute API + `wss://`; no `X-E2E-Test`; `.dockerignore` native trees | C0 |
| **C3 Push** | **Separate spec** — not this file | Owner |
| **C4 Store listing** | Privacy labels, account deletion (`/legal`), screenshots without targets/IPs | C2 |

Default if forced: **C0 → C1**, or **C0 → C2** without C3 in the same epic.

---

## 9. Push — not in this spec

**C3 Push is out of this document.** No `device_tokens` table, no FCM/APNs, no fan-out, no Alembic sketched here.

If the owner asks later: new spec. Do **not** use `POST /api/guard/enroll` (host agent redeem) as device login. Default for first store version: **no push**.

---

## 10. Security & hygiene

- Public repo: no SSH hosts, no real emails/passwords, no FCM JSON, no customer dumps in `*.md`
- Deep links / App Links / Universal Links: **out of C2** unless the store requires associated domains (then a slice of C4 / open question)
- Certificate pinning: **out** of v1
- Rate limit: no aggressive background refresh loops; CGNAT shares 300/h/IP with desktop
- Guard agent `ip` on `GET /api/guard/agents`: SPA already shows it; do not add extra on-device caches of agent IPs in C2
- Store review: security-tool category; prepare rejection handling — do not claim “hacking toolkit”

---

## 11. Acceptance (when implement is approved)

**C1 PWA**

- [ ] Web manifest + `start_url`; installable from mobile Safari/Chrome on `sinexis.app`; icon opens `/dashboard` (auth gate)
- [ ] No Capacitor in `main` deploy path

**C2 Bundled**

- [ ] Android + iOS debug: password login on a **real device**
- [ ] CapacitorHttp on; **no** Capacitor origins in `CORS_ORIGINS`
- [ ] After password login, kill app, relaunch: session restores via **body** refresh (cookie-only **fails** this check)
- [ ] Org switch persists both tokens; 429 refresh does not loop
- [ ] Logout revokes server-side; second refresh fails
- [ ] No `X-E2E-Test` in store/debug binary traffic
- [ ] Scan WebSocket uses `wss://` API host, not `localhost`
- [ ] API HTTPS to production/staging, not `https://localhost/api`
- [ ] `frontend` Docker / `frontend-build` does not copy or build Gradle/Xcode
- [ ] Committed `capacitor.config.ts` has no `server.url` / `cleartext` / `allowNavigation`
- [ ] No secrets in git
- [ ] Viewer cannot start scans (existing SPA)
- [ ] Google button degrades; password login works on device

**C3** — dedicated push spec (not acceptance here).

---

## 12. Anti-patterns

- Naming slices **P0–P4** (collides with Scan/Workspace/Guard)
- Committing `server.url` for production (Capacitor forbids)
- Relative `VITE_API_URL=""` in the WebView (requests `https://localhost/api`)
- Allowlisting `https://localhost` / `capacitor://localhost` in prod CORS
- `server.hostname` = production API host to steal first-party cookies
- `cap sync` inside the SPA Docker build
- Shipping `X-E2E-Test` in the WebView bundle
- Polling dashboard every 30s
- Flutter “because iOS”
- `X-API-Key` in the APK
- Mixing Guard enroll tokens with user session
- Implementing C3 because a table was once sketched here
- Implementing because this file exists

---

## 13. Open questions (owner)

1. Store accounts / `appId` under which legal entity?
2. Is **C1 PWA** enough (no store)? **Recommended parked answer: yes.**
3. If store: Capacitor **v8** vs pin 7?
4. Push in first store version? (Default **no**.)
5. Google-in-WebView vs native Google plugin?
6. Public `android/`/`ios/` vs private sibling?
