# Public surface v1 — products

**Status:** shipped in S1. Scope: `/products` hub and the five product pages.
**Design contract:** [`frontend/design/products.md`](../../frontend/design/products.md).
**Route registry:** [`docs/AGENT_PAGE_REGISTRY.md`](../AGENT_PAGE_REGISTRY.md).

The public SPA is a branded house on one domain. `/products` is the hub; each product page is a shared template keyed by a registry slug. No pricing page, no microsite, and no SSR in this slice.

---

## 1. Route map

| Route | Surface | Page component | Indexable | Public nav |
|---|---|---|---|---|
| `/products` | SPA | `pages/Products.tsx` | Yes | header + footer |
| `/products/scan` | SPA | `pages/products/ProductPage.tsx` | Yes | footer |
| `/products/guard` | SPA | `pages/products/ProductPage.tsx` | Yes | footer |
| `/products/host` | SPA | `pages/products/ProductPage.tsx` | Yes | footer |
| `/products/uptime` | SPA | `pages/products/ProductPage.tsx` | Yes | footer |
| `/products/ai-gateway` | SPA | `pages/products/ProductPage.tsx` | Yes | footer |
| `/` | SPA | `pages/Landing.tsx` | Yes | brand |
| `/blog`, `/blog/{slug}` | FastAPI island | — | Yes | header + footer |
| `/terms`, `/privacy` | FastAPI island | — | Yes | footer |

Unknown product slugs render the existing 404 component and set `meta[name="robots"]` to `noindex`.

`/` now uses the umbrella home: 4 pillar cards, a 3-step attach model (`Connect → Watch → Prove`), and a 6-item FAQ, with the same header/footer nav as `/products`.

### Nav budget

- Header: `Products`, `Blog`, theme, language, `Sign in`, `Get started`.
- Footer: `Home`, `Products`, `Blog`, `Terms`, `Privacy`, `Sign in`, `Get started`.
- The mobile `Sheet` repeats `Products` and `Blog`.

---

## 2. Status labels

Status is editorial, never read from a runtime flag. A page bundles capabilities, so the page-level label can be `Mixed` while each capability keeps its own label.

| Label | Meaning | Where |
|---|---|---|
| `Live` | Shipped and generally available on a plan | Scan, Guard, Uptime page; Scan/Attach/Assets, Guard, Host Protect, Uptime, Status page capabilities |
| `Limited` | Shipped with a plan or environment constraint | Host WAF |
| `By request` | Enabled per account by ops | SIEM |
| `Beta` | Access requested per account | AI Gateway |
| `Mixed` | The page bundles capabilities with different labels | Host page only |

`Mixed` never appears on a single capability. `Live` is never used for `By request`, `Beta`, or plan-gated copy.

---

## 3. Copy rules and caveats

Every product page has a real **What it does not do** block. No page claims a capability is live when it is requested, beta, or plan-gated.

### Page-specific non-negotiables

| Page | Required statement |
|---|---|
| Guard | SIEM is `By request`, never included. |
| Host | “Host add-on. Requires a Guard agent on the same VM. Returns empty on a clean disk.” |
| Host | WAF: “Pro and Multi. Runs in your nginx, never on the Sinexis edge.” |
| Uptime | “Publish on Pro, Multi, and Enterprise. Custom hostname on Multi and Enterprise.” |
| AI Gateway | “Beta. Request access; wallet and keys are issued per org.” |

### Forbidden claims

- No “real-time”, “pentest”, “24/7 SOC”, “SLA”, or “edge WAF” claim.
- No “included” claim for SIEM, Host Protect, Host WAF, status-page publishing, or AI Gateway credits.
- No “GA” or “free” claim for AI Gateway.
- No pricing, credits, or runtime flags in the registry.
- No claim that Host Protect is part of Scan; it is a host add-on that requires Guard.

### CTA rules

| Page status | CTA label | Target |
|---|---|---|
| `Live` | `Get started` | `/register` |
| `Limited`, `By request`, `Beta` | `Create an account and request access` | `/register` + enablement note |
| `Mixed` | `Create an account and request access` | `/register` + enablement note |

`Mixed` uses the request path because at least one bundled capability is plan-gated. No fake “Start free” and no `mailto:`.

---

## 4. Registry contract

`frontend/src/lib/services.ts` is the single frontend source for the hub, product pages, footer links, and metadata.

```ts
export type ServiceStatus = "live" | "limited" | "by_request" | "beta" | "mixed";

export type Capability = {
  key: string;
  status: ServiceStatus;
  noteKey?: string;
};

export type ServiceEntry = {
  slug: string;
  nameKey: string;
  summaryKey: string;
  status: ServiceStatus;
  pillar: "exposure" | "onbox" | "availability" | "ai";
  order: number;
  published: boolean;
  metaTitleKey: string;
  metaDescriptionKey: string;
  capabilities: readonly Capability[];
  related: readonly string[];
};
```

### Invariants

1. Slugs are unique and URL-safe.
2. `slug` appears before `published` in every object literal; the sync script parses that order.
3. `published` is true only when the page exists. All five S1 slugs are published.
4. `nameKey`, `summaryKey`, `metaTitleKey`, and `metaDescriptionKey` exist in both `en` and `id` products catalogs.
5. Meta titles and descriptions are unique per slug in both locales.
6. Capabilities never use `mixed`; the page-level entry may.
7. `related` holds at most two slugs, never itself, and every slug exists.
8. Entries never encode prices, credits, or runtime flags.

### Pillars

| Pillar | Slug |
|---|---|
| `exposure` | `scan` |
| `onbox` | `guard`, `host` |
| `availability` | `uptime` |
| `ai` | `ai-gateway` |

### Sitemap sync

`backend/app/api/sitemap_html.py` holds the derived `PRODUCT_SLUGS` tuple for `/products` and `/products/{slug}`. `scripts/check-public-registry-sync.mjs` fails CI when the tuple and the published registry entries drift. A new product needs: registry entry + locale keys + page + tuple update.

---

## 5. Page section order

1. Status badge and `h1`
2. One-paragraph intro and capability badges with notes
3. `What it does` — 3 bullets
4. `What it does not do` — 2–3 bullets
5. `How it works` — 3 steps
6. `Requirements and limits`
7. CTA
8. Related products — at most 2

The hub has one `h1`, four pillar sections (`exposure`, `onbox`, `availability`, `ai`), and exactly five product cards. Each card shows the product name, status badge, summary, and a link to `/products/<slug>`.

---

## 6. Metadata and indexing

- `usePageMeta` sets title, description, canonical, and OG tags per route.
- Public product pages set `robots: "index"`.
- Unknown slugs set `robots: "noindex"` and render the 404 surface.
- The sitemap includes `/products` and the five product URLs; blog URLs stay gated by `BLOG_ENABLED`; `/`, `/terms`, and `/privacy` are always present.
- Social crawlers that do not execute JavaScript may miss the per-page OG tags. This SPA limitation is accepted; prerender is not part of this slice.

---

## 7. Verification

```bash
cd frontend
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/
./node_modules/.bin/vitest run src/test/services.test.ts src/test/Products.test.tsx src/test/ProductPage.test.tsx

cd ../backend
pytest tests/test_sitemap.py -q

cd ..
node scripts/check-public-registry-sync.mjs
node scripts/check-design-docs.mjs
```

The route rows and test columns stay mirrored in [`docs/AGENT_PAGE_REGISTRY.md`](../AGENT_PAGE_REGISTRY.md).
