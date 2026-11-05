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

const allowed = (path: string) => EXACT.includes(path) || ALLOWLIST.test(path);

const ROUTES = [...APP_SOURCE.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);

// Concrete shape of a `:param` route, e.g. /products/:slug -> /products/abc123.
function sample(path: string): string {
  return path.replace(/:[A-Za-z0-9_]+/g, "abc123");
}

describe("SPA route allowlist (nginx)", () => {
  it("parsed a meaningful route set", () => {
    expect(ROUTES.length).toBeGreaterThan(30);
    expect(ROUTES).toContain("/dashboard");
    expect(ROUTES).toContain("/products/:slug");
    expect(ROUTES).toContain("/admin/users/:id");
    expect(ROUTES).toContain("*");
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
    ];
    const wronglyAllowed = unknown.filter((path) => allowed(path));
    expect(wronglyAllowed).toEqual([]);
  });

  it("keeps / and /assets as exact SPA locations", () => {
    expect(ROUTE_BLOCK).toMatch(/location = \/ \{/);
    expect(ROUTE_BLOCK).toMatch(/location = \/assets \{/);
    expect(ROUTE_BLOCK).toMatch(/location = \/assets\/ \{/);
  });

  it("answers unknown paths with a 404 status and the app shell", () => {
    expect(NGINX_SOURCE).toMatch(/try_files \$uri =404;/);
    expect(NGINX_SOURCE).toMatch(/error_page 404 \/index\.html;/);
    // A bare `/index.html` fallback would restore the 200 soft-404.
    expect(NGINX_SOURCE).not.toMatch(/try_files \$uri \/index\.html;/);
  });
});
