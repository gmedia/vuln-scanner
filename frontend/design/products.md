# Products hub and product pages

**Routes:** `/products`, `/products/scan`, `/products/guard`, `/products/host`, `/products/uptime`, `/products/ai-gateway`
**Components:** `pages/Products.tsx`, `pages/products/ProductPage.tsx`, `components/public/PublicHeader.tsx`, `lib/services.ts`.

This surface is public marketing chrome in the SPA. It rhymes with Landing and never introduces a second palette or a new primitive.

### 0. Research Log

- The hub copies the Landing section rhythm: eyebrow, one `h1`, then a vertical stack of bordered sections with `h2` headings.
- The product page copies the Landing card rhythm: section headings, a two-column card comparison, a three-step numbered loop, then a CTA.
- Public chrome comes from the shared Landing header measurements (`h-12`, `max-w-6xl`, `2xl:max-w-[90rem]`, `px-4`, `border-border`) and `components/Footer.tsx`.
- No reference was pulled beyond the existing Landing. The registry (`lib/services.ts`) is the content source, not a screenshot.
- Accepted direction: a calm documentation surface. Status is editorial, never a runtime flag.

### 1. Atmosphere & Identity

The one memorable moment is the **status row**: every product page opens with a status badge and a capability list, so a `Mixed` page explains itself before the reader scrolls. The hub stays quiet; its job is to route, not to sell.

The surface reads as one product family, not five landing pages. No gradients, no illustration, no second accent.

### 2. Color

Reuse `index.css` `:root` / `.dark`. No new token and no raw color literal.

| Role | Token / primitive | Usage |
|------|-------------------|-------|
| Canvas | `bg-background` | Page background |
| Card | `bg-card` + `border-border` | Product cards, section cards |
| Accent | `--primary` / `text-primary-text` | Status `success` badge, check glyph, CTA |
| Muted | `text-muted-foreground` | Summaries, notes, section descriptions |
| Status `Live` | `Badge variant="success"` | Page and capability badges |
| Status `Limited` | `Badge variant="pending"` | Host WAF |
| Status `By request`, `Beta` | `Badge variant="info"` | SIEM and AI Gateway |
| Status `Mixed` | `Badge variant="default"` | Host page-level badge only |

Status copy is the source of truth. Color is a secondary cue; a reader who cannot see color still gets the label.

### 3. Typography

- `h1` — `text-3xl font-bold tracking-tight sm:text-4xl`, one per page.
- `h2` — `text-xl font-bold tracking-wide` for pillars, product sections, and CTA.
- Card titles — kit `CardTitle` at `text-sm tracking-wide`.
- Body and bullets — `text-sm leading-relaxed`, never below the kit body scale.
- Eyebrow — `text-xs font-medium uppercase tracking-wide text-muted-foreground`.

No new font family. Product names are copy, not a display typeface.

### 4. Spacing & Layout

- Header: `h-12`, `max-w-6xl`, `2xl:max-w-[90rem]`, `px-4`.
- Main: `px-4 py-12`, inner `max-w-6xl 2xl:max-w-[90rem]`.
- Hub: a single-column stack of four `<section id="…">` blocks with `space-y-12`.
- Cards: `grid-cols-1` below `sm`, `sm:grid-cols-2` at `sm`; the on-box pillar holds two cards.
- Product page: header block, a two-column card grid below `lg`, a three-column step grid at `sm`, then requirements, CTA, and related cards.
- Related cards are capped at two by `related` in `lib/services.ts`.

**Frozen contracts**

| Contract | Value |
|----------|-------|
| Routes | `/products`, `/products/:slug` |
| Slugs | `scan`, `guard`, `host`, `uptime`, `ai-gateway` |
| Pillar ids | `exposure`, `onbox`, `availability`, `ai` |
| Hub cards | exactly 5 |
| Hub `h1` | exactly 1 |
| Hub card testid | `product-card-<slug>` |
| Related card testid | `related-<slug>` |
| Product `h1` | exactly 1 per page |
| What-it-does bullets | exactly 3 |
| What-it-does-not bullets | 2–3 |
| How-it-works steps | exactly 3 |
| Related products | at most 2 |
| Status labels | `Live`, `Limited`, `By request`, `Beta`, `Mixed` |
| CTA targets | `/register` only |

The route row and test columns stay mirrored in `docs/AGENT_PAGE_REGISTRY.md`.

### 5. Signature Components & States

| Primitive | Anatomy | States |
|-----------|---------|--------|
| Public header | `BrandMark`, `Products`, `Blog`, theme + language switchers, `Sign in`, `Get started`, mobile `Sheet` | static; the mobile `Sheet` repeats `Products` and `Blog` |
| Footer | `Home`, `Products`, `Blog`, `Terms`, `Privacy`, `Sign in`, `Get started` | static |
| Hub pillar section | `h2` + blurb + card grid | one card for three pillars, two for on-box |
| Hub product card | `Card` + `CardTitle` + status `Badge` + summary + link | static link to `/products/<slug>` |
| Product header | status `Badge`, one `h1`, intro, capability rows | `Mixed` still lists each capability with its own badge |
| Product sections | two `Card`s for does / does-not, numbered step list, requirements `Card`, CTA `Card`, related cards | static |
| Unknown slug | `NotFound` component | 404 render + `noindex` in `usePageMeta` |

No modal, no tabs, no accordion, no filters. The only interactive chrome is the shared header and the CTA link.

### 6. Motion

Static public surface. The only motion is the kit's existing hover transition on cards and links (`transition-colors`). No entrance animation, no scroll effect, and no motion token is added.

### 7. Depth & Surface

Hairline borders and flat cards, matching Landing. No shadow token, no nested card island, no glass effect. The status badge is the only saturated chip on the page.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- Exactly one `h1` per page; section headings descend to `h2`, card titles are `h3`.
- Header and mobile `Sheet` both expose `Products` and `Blog`; the footer uses a single `Site` navigation landmark.
- Every status is a text label inside the badge; color never carries the meaning alone.
- Product links announce the product name (`Open <name>`), not a bare "Read more".
- CTA buttons use `Button` with `Link` children; no native primary `<button>` and no native `<select>`.
- Unknown slugs render the existing 404 surface and set `meta[name="robots"]` to `noindex`.

#### Accepted debt

- Product pages are client-rendered, so social crawlers that do not execute JavaScript may miss the per-page description and OG tags. This is the SPA limitation accepted by the plan; it is not fixed in this slice.
- The registry is duplicated in the Python sitemap tuple by design; `scripts/check-public-registry-sync.mjs` fails CI on drift.
