# Spec: Light / dark appearance — theme v1

**Status:** **S1–S3 on `main`** (#375). Follow-up: surface tokens aligned to grok2api reference (neutral chrome invert; **primary stays green**).
**Goal:** Let operators switch the SPA between **dark** (current default) and **light** without a layout redesign, rebrand, or new product module.
**Suggested epic label:** **P9** (after P8 i18n in [`docs/AGENT_EXECUTION_GUIDE.md`](../AGENT_EXECUTION_GUIDE.md) §1.3). Does **not** jump ahead of GTM / P3 unless the user reorders.
**Depends:** Tailwind v4 + shadcn tokens in `frontend/src/index.css` · `@custom-variant dark (&:is(.dark *))` already present · P8 i18n switcher pattern (`LanguageSwitcher` + `localStorage`).
**Not this epic:** per-org theme · high-contrast a11y overhaul · custom brand palettes · PWA `theme-color` per-install · executive HTML / notify email restyle · Wazuh dashboard · SIEM feature work · app sidebar replacing the top header.

---

## 1. Problem

| Today | Pain |
|-------|------|
| `:root` in `index.css` is **dark-only** (background `hsl(0 0% 4%)`) | No light token set |
| `@custom-variant dark (&:is(.dark *))` exists but **no `.dark` class** is applied on `html` | Variant is unused; app is “always dark via :root” |
| `index.html` `theme-color` is `#0a0a0a` | Browser chrome stays dark even if we later add light |
| Scrollbar colors are hardcoded `hsl(0 0% 9%)` / `28%` | Would look wrong on a light canvas |
| No toggle, no `localStorage`, no `prefers-color-scheme` | Users in bright rooms cannot switch |
| Charts / badges / severity colors assume dark cards | Naive invert will fail contrast |

Attach upsell and SOC operators often work in **dark** (current product look). Light is for **office / projector / print-adjacent** viewing — not a rebrand.

---

## 2. Goals

1. **Two appearances only:** `dark` and `light`. No “system” as a third stored value in v1 unless §11 unlocks it.
2. **Default = `dark`** — matches shipped SPA, screenshots, and `theme-color`. First visit without a stored preference → dark.
3. **User-selectable** in the authenticated shell **and** public landing / auth layouts (same chrome as `LanguageSwitcher`).
4. **Persist** in `localStorage` key `sinexis.theme` (`dark` \| `light`). No `users.theme` column in v1 (unlike locale S6).
5. **Apply** by toggling class `dark` on `<html>` (shadcn / Tailwind v4 convention). Light = **no** `dark` class + light tokens on `:root`. Dark = class `dark` + `.dark { … }` overrides **or** keep current values on `.dark` and move light to `:root`.
6. **FOUC:** inline boot script in `index.html` (or `main.tsx` before paint) reads `localStorage` and sets class **before** first paint.
7. **Tests:** freeze existing testids; add `data-testid="theme-switcher"` / `theme-dark` / `theme-light`. Vitest default remains dark (no class or explicit dark in `setup.ts`). Optional one e2e that toggles and asserts `html.dark` or not.
8. **Docs:** this spek. No customer PII. Pointer in execution guide only when S0 merges **and** user confirms P9.

---

## 3. Non-goals (explicit)

| Out | Why |
|-----|-----|
| Third theme (high contrast, “oled”, brand color packs) | Scope lock |
| Follow `prefers-color-scheme` as **override of default** without stored choice | Operators often have OS light + want product dark; default **dark** is safer (mirror i18n “always id”) |
| Persist theme on `User` / JWT | Extra migration; locale already has PATCH `/me`; theme is visual-only |
| Restyling executive HTML, PDF, notify email | Those are ID-first documents; print CSS separate |
| Recoloring CVE/severity semantic colors to “pretty pastels” | Integrity of risk chrome; keep red/amber/green meaning |
| Wave G layout / Guide TOC redesign | Theme is tokens + toggle only |
| `next-themes` unless a slice proves class+storage is too error-prone | Prefer zero new dep; app already has i18n persistence DIY |
| Mass screenshot / Chromatic suite | Manual spot-check + existing Playwright |

---

## 4. Defaults (locked unless user overrides)

| Topic | Default |
|-------|---------|
| Default appearance | **`dark`** |
| Alternate | **`light`** |
| Persistence v1 | `localStorage` `sinexis.theme` |
| Persistence v1.1 | Optional `users.theme` — **out of v1** |
| Detection | If no key: **dark**. Do **not** auto-follow OS in v1 |
| HTML | `class="dark"` on `<html>` when dark; omit when light. Keep `lang` from i18n |
| `theme-color` meta | Dark `#0a0a0a`; light a near-white from tokens (e.g. `#fafafa`) — update on switch |
| `color-scheme` CSS | `color-scheme: dark` / `light` on `html` so native inputs/scrollbars match |
| Charts | Recharts / shadcn Chart consume CSS variables (`--foreground`, `--muted`, `--primary`). After tokens land, **spot-check** SeverityChart; do not rewrite chart geometry |
| Toasts (sonner) | Pass theme prop from the same store so toasts are not stuck dark |
| Brand | Wordmark / favicon **unchanged** in v1 (dark-on-dark already works; light may need a later asset slice if contrast fails) |
| Testids | **Do not rename** frozen ids from shadcn/i18n speks. **Add** theme switcher ids |
| Copy | ID: “Tampilan”, “Gelap”, “Terang”. EN: “Appearance”, “Dark”, “Light” — keys in `common` ns |

---

## 5. Surfaces

### 5.1 In scope — SPA chrome

- Token split in `frontend/src/index.css` (`:root` light **or** keep `:root` dark and invert — see §6 recommended approach).
- Scrollbar rules: use tokens / `color-scheme`, not hardcoded greys.
- `ThemeSwitcher` next to `LanguageSwitcher` in `Header`, `AuthLayout`, `Landing`.
- Boot script + `theme-color` + `color-scheme`.
- `sonner` theme sync.
- Vitest: switcher unit test (mirror `LanguageSwitcher.test.tsx`).
- Catalogs: `frontend/src/locales/{id,en}/common.json` keys only.

### 5.2 Out of scope

- Backend, workers, executive HTML templates, AM email kit.
- Guard/SIEM **features**.
- `components/ui/*` primitive restyle except if a primitive hardcodes a hex (audit in S1).

---

## 6. Recommended token strategy

**Keep the current `:root` values as `.dark { … }`** (zero visual change for default users).

**Put a light palette on `:root`** (shadcn zinc/neutral light, **primary stays green** `hsl(142 71% 45%)` for brand continuity).

Boot: if stored/default is dark → `document.documentElement.classList.add("dark")`.

**Why not leave `:root` dark and only add `.light`:** Tailwind v4 custom variant is `dark (&:is(.dark *))`. Light-as-default-on-`:root` + `.dark` overrides matches shadcn docs and `class="dark"`.

**Light / dark surfaces (grok2api-aligned, 2026-08-21):** invert **chrome only**. Semantic green / red / amber stay. Do **not** invert `--primary` to black/white (Scan/Attach CTAs stay brand green). Layout (top header vs grok2api sidebar) is **out**.

| Token | Light | Dark |
|-------|--------|------|
| `--background` | `hsl(0 0% 98%)` (~`#FAFAFA`) | `hsl(0 0% 4%)` (~`#0A0A0A`) |
| `--foreground` | `hsl(0 0% 7%)` | `hsl(0 0% 96%)` |
| `--card` | `hsl(0 0% 100%)` | `hsl(0 0% 8%)` (~`#141414`) |
| `--muted` | `hsl(0 0% 96%)` | `hsl(0 0% 12%)` |
| `--muted-foreground` | `hsl(0 0% 45%)` | `hsl(0 0% 45%)` |
| `--border` | `hsl(0 0% 90%)` (~`#E5E7EB`) | `hsl(0 0% 16%)` (~`#262626`) |
| `--input` | `hsl(0 0% 94%)` (inset wash) | `hsl(0 0% 11%)` |
| `--sidebar` | `hsl(0 0% 100%)` | `hsl(0 0% 4%)` (same family as canvas) |
| `--primary` | **same green** `hsl(142 71% 45%)` | same |
| `--destructive` | keep readable on light | keep |
| `--radius` | `0.75rem` (12px) both themes | same |

Elevation: **hairline border only** (no `shadow-sm` / `shadow-lg` on Card, Dialog, AlertDialog, or primary Button). Primary CTA stays **green** (`bg-primary`), not inverted black/white.

Density (grok2api-adjacent): table head `h-8` + `text-xs`; cells `px-3 py-1.5`; card padding `p-4`; inputs use `--input` wash. Guard empty agents/alerts: island panel + muted icon, **no** fake Connect CTA. Dashboard: `space-y-4` / `gap-4` (not 6); default-size header CTAs (not `size="lg"` / `min-h-11`); empty scans use the same island chrome **and keep** real Scan IP / schedule links.

Severity badge variants (`completed`, `pending`, `running`, finding colors): **audit** in S1; if they use `bg-emerald-500` etc. they may already work on both.

**Hardcoded greys to replace:** scrollbar block in `index.css` (~lines 91–118).

---

## 7. UX

- Control: **segmented control** like language (Gelap | Terang), `role="group"`, `aria-pressed`, `aria-label` from i18n.
- Placement: immediately **left or right of** `LanguageSwitcher` (same `gap-2` cluster). Do not hide behind user menu only — landing/auth have no user menu.
- No page reload. Instant class toggle.
- Invalid stored value → treat as `dark`.

---

## 8. Slices (one PR each)

| Slice | Scope | DoD | Out |
|-------|--------|-----|-----|
| **S0** | This spek | Merged markdown; no app code | Tokens, toggle |
| **S1** | Tokens: `:root` light + `.dark` = current; scrollbar/`color-scheme`; FOUC boot in `index.html` | Default visit still **looks like today’s dark**; `html.dark` present by default | Switcher UI |
| **S2** | `ThemeSwitcher` + `localStorage` + catalogs + Header/Auth/Landing | Toggle survives refresh; Vitest; testids | User API |
| **S3** | sonner + `theme-color` + SeverityChart/Landing spot-check + optional Playwright | Toasts + chart readable in both; CI green | Email/HTML reports |

Do **not** combine S1 token move with a layout PR.

**Anti-pattern:** implementing S2 before S1 (toggle with no light tokens = broken light).

---

## 9. Tests

| Layer | Expectation |
|-------|-------------|
| Vitest | Switcher sets `document.documentElement.classList` and `localStorage`; default dark |
| Vitest | Existing page tests **do not** require light; setup can force `dark` class |
| Playwright | Prefer testids; one smoke: click light → `html` lacks `dark` (or `color-scheme: light`) |
| Visual | Manual: Dashboard, ScanDetail findings, Schedules, Guard, SIEM flag-off, Guide, Login, Landing |

**Frozen testids:** unchanged. New: `theme-switcher`, `theme-dark`, `theme-light`.

---

## 10. Risks

| Risk | Mitigation |
|------|------------|
| Moving tokens to `.dark` **shifts default** if boot script fails | S1 must ship boot script in **same** PR as token split |
| Light contrast on primary-on-white | Keep primary green; check Button/Badge |
| Chart/tooltip hardcoded fills | Audit `chart.tsx` / `SeverityChart` in S3 |
| Favicon / BrandMark low contrast on light | Spot-check; asset follow-up if needed — not S1 |
| FOUC on slow parse | Inline script in `index.html` head, no module delay |
| e2e flake on class timing | Assert after click; don’t screenshot-diff in CI v1 |

---

## 11. Open questions (answer before S1 code)

1. **`system` option** (follow OS)? **Recommendation: no in v1** — two buttons only.
2. **Default dark even if OS is light?** **Recommendation: yes.**
3. **Persist on user account?** **Recommendation: v1 localStorage only.**
4. **Add `next-themes`?** **Recommendation: no** unless S1 FOUC is painful.
5. **Light landing marketing vs app?** **Recommendation: same tokens** — one switcher, one tree.
6. **Guide screenshots in markdown?** **Out** — no new screenshots in git.

---

## 12. Success criteria (epic)

- [ ] User can switch dark ↔ light without reload bugs; choice survives refresh.
- [ ] Default new session = **dark** (pixel-close to current prod).
- [ ] Native form controls / scrollbars match `color-scheme`.
- [ ] Frozen testids unchanged; CI green.
- [ ] No layout epic disguised as theme.
- [ ] GTM / finance / Guard lab **unchanged**.

---

## 13. Suggested guide one-liner (when S0 merges)

| **P9** | **Theme light/dark** | Office / projector users | Token split, switcher, `sinexis.theme` | System theme, user column, report HTML | **S0 draft** — this spek; **no S1+ until implement + §11** |

---

## 14. Implementation note for agents

- Prefix git with `GIT_MASTER=1`; never work on `main`.
- Speak Bahasa with the user; PR body English.
- Do not start S1 until **implement** and §11 answers (or user accepts §4 as lock).
- Coding host: no Docker required for S0–S2.
- Public hygiene: no IPs, passwords, or customer dumps in this file.
