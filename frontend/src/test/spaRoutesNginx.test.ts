import { describe, expect, it } from "vitest";

// SEO guard against soft 404s. nginx used to answer `200 index.html` for every
// unknown path; crawlers then indexed junk URLs. Only real SPA routes may serve
// the shell with a 200, and unknown paths must keep the 404 status while still
// rendering the app so `NotFound` shows. Read both files as raw source so the
// check needs no filesystem access (same pattern as pageNavTabs.test.ts).
const APP_SOURCE = Object.values(
  import.meta.glob("../App.tsx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
)[0];

const NGINX_SOURCE = Object.values(
  import.meta.glob("../../nginx.conf", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
)[0];

const ROUTE_BLOCK = (() => {
  const start = NGINX_SOURCE.indexOf("SPA-ROUTES-BEGIN");
  const end = NGINX_SOURCE.indexOf("SPA-ROUTES-END");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return NGINX_SOURCE.slice(start, end);
})();

const ALLOWLIST = (() => {
  const match = /location ~ "([^"]+)"/.exec(ROUTE_BLOCK);
  expect(match).not.toBeNull();
  return new RegExp(match![1]);
})();

// `/` and `/assets` are served by exact `location =` blocks, not the regex
// (the regex cannot express a bare `/` without also matching `//`).
const EXACT = [...ROUTE_BLOCK.matchAll(/location = (\S+)\s*\{/g)].map(
  (m) => m[1],
);

const PRODUCT_BLOCK = (() => {
  const start = NGINX_SOURCE.indexOf("PRODUCT-SLUGS-BEGIN");
  const end = NGINX_SOURCE.indexOf("PRODUCT-SLUGS-END");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return NGINX_SOURCE.slice(start, end);
})();

const PRODUCT_SLUGS = (() => {
  const match = /location ~ "\^\/products\/\(([^)]+)\)/.exec(PRODUCT_BLOCK);
  expect(match).not.toBeNull();
  return match![1].split("|").map((slug) => slug.trim());
})();

const PRODUCT_ALLOWLIST = (() => {
  const match = /location ~ "([^"]+)"/.exec(PRODUCT_BLOCK);
  expect(match).not.toBeNull();
  return new RegExp(match![1]);
})();

const allowed = (path: string) =>
  EXACT.includes(path) || ALLOWLIST.test(path) || PRODUCT_ALLOWLIST.test(path);

// `:param` routes are validated server-side against real data, not by nginx.
// `/products/:slug` is the exception: its slug set is a fixed registry, so nginx
// can and must answer 404 for an unknown slug.
const DATA_VALIDATED_ROUTES = ["/products/:slug"];

const ROUTES = [...APP_SOURCE.matchAll(/path="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((route) => !DATA_VALIDATED_ROUTES.includes(route));

// Concrete shape of a `:param` route, e.g. /scan/:id -> /scan/abc123.
function sample(path: string): string {
  return path.replace(/:[A-Za-z0-9_]+/g, "abc123");
}

describe("SPA route allowlist (nginx)", () => {
  it("parsed a meaningful route set", () => {
    expect(ROUTES.length).toBeGreaterThan(30);
    expect(ROUTES).toContain("/dashboard");
    expect(ROUTES).toContain("/admin/users/:id");
    expect(ROUTES).toContain("*");
    expect(PRODUCT_SLUGS.length).toBeGreaterThan(0);
  });

  it("serves the app for every route declared in App.tsx", () => {
    const missing = ROUTES.filter((route) => route !== "*").filter(
      (route) => !allowed(sample(route)),
    );
    expect(missing).toEqual([]);
  });

  it("tolerates a trailing slash like React Router does", () => {
    const missing = ROUTES.filter(
      (route) => route !== "*" && route !== "/",
    ).filter((route) => !allowed(`${sample(route)}/`));
    expect(missing).toEqual([]);
  });

  it("keeps unknown paths out of the allowlist", () => {
    // Paths the e2e suite uses to assert the NotFound page renders.
    const unknown = [
      "/some/nonexistent/route",
      "/random-unknown-path",
      "/random-path",
      "/guest-unknown-path",
      "/produk-tipu",
      "/artikel-palsu-x1",
      "/admin/nope",
      "/scan",
      "/blog",
      "/products/not-a-product",
    ];
    const wronglyAllowed = unknown.filter((path) => allowed(path));
    expect(wronglyAllowed).toEqual([]);
  });

  it("serves every published product slug and 404s the rest", () => {
    for (const slug of PRODUCT_SLUGS) {
      expect({ slug, ok: allowed(`/products/${slug}`) }).toEqual({
        slug,
        ok: true,
      });
      expect({ slug, ok: allowed(`/products/${slug}/`) }).toEqual({
        slug,
        ok: true,
      });
    }
    expect(allowed("/products/not-a-product")).toBe(false);
  });

  it("declares no duplicate or empty product slugs", () => {
    expect(PRODUCT_SLUGS).toEqual([...new Set(PRODUCT_SLUGS)]);
    expect(PRODUCT_SLUGS.filter((slug) => !/^[a-z0-9-]+$/.test(slug))).toEqual(
      [],
    );
  });

  it("keeps / and /assets as exact SPA locations", () => {
    expect(ROUTE_BLOCK).toMatch(/location = \/ \{/);
    expect(ROUTE_BLOCK).toMatch(/location = \/assets \{/);
    expect(ROUTE_BLOCK).toMatch(/location = \/assets\/ \{/);
  });

  it("prefers a prerendered document before the shell", () => {
    const allowlist =
      ROUTE_BLOCK.match(/location ~ "[^"]+" \{[^}]*\}/)?.[0] ?? "";
    const product =
      PRODUCT_BLOCK.match(/location ~ "[^"]+" \{[^}]*\}/)?.[0] ?? "";

    for (const [label, block] of [
      ["spa routes", allowlist],
      ["product slugs", product],
    ]) {
      expect(block, label).toContain("try_files $uri.html /index.html =404;");
    }
  });

  it("answers unknown paths with a 404 status and the app shell", () => {
    expect(NGINX_SOURCE).toMatch(/try_files \$uri =404;/);
    expect(NGINX_SOURCE).toMatch(/error_page 404 \/index\.html;/);
    // A bare `/index.html` fallback would restore the 200 soft-404.
    expect(NGINX_SOURCE).not.toMatch(/try_files \$uri \/index\.html;/);
  });
});
