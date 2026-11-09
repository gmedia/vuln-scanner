import { describe, expect, it } from "vitest";

// robots.txt is hand-maintained while the route table lives in App.tsx, so the
// two drift: /credit-history and /pay/:invoiceId were crawlable for a full SEO
// pass, and every private page that skips `usePageMeta` inherits the static
// canonical `https://sinexis.app/` from index.html. This check derives the route
// set from App.tsx and fails when a non-public route has no `Disallow` rule.
// Read both files as raw source (same pattern as spaRoutesNginx.test.ts).
const APP_SOURCE = Object.values(
  import.meta.glob("../App.tsx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
)[0];

const ROBOTS_SOURCE = Object.values(
  import.meta.glob("../../public/robots.txt", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
)[0];

/** Routes a crawler may index. Everything else in App.tsx is private. */
const PUBLIC_ROUTES = ["/", "/products", "/products/:slug"];

/** HTML served by FastAPI islands, not the SPA — they are not in App.tsx. */
const PUBLIC_NON_SPA = ["/blog/some-post", "/terms", "/privacy"];

const ROUTES = [...APP_SOURCE.matchAll(/path="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((route) => route !== "*");

const PRIVATE_ROUTES = ROUTES.filter((route) => !PUBLIC_ROUTES.includes(route));

function directives(name: string): string[] {
  return ROBOTS_SOURCE.split("\n")
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().startsWith(`${name.toLowerCase()}:`))
    .map((line) => line.slice(name.length + 1).trim());
}

const DISALLOW = directives("Disallow");
const SITEMAP = directives("Sitemap");

/** robots.txt matching for the subset we use: prefix rules plus a trailing `$`. */
function isDisallowed(path: string): boolean {
  return DISALLOW.some((rule) => {
    if (rule === "") return false;
    if (rule.endsWith("$")) return path === rule.slice(0, -1);
    return path.startsWith(rule);
  });
}

/** Concrete URL for a `:param` route, e.g. /pay/:invoiceId -> /pay/abc123. */
function sample(path: string): string {
  return path.replace(/:[A-Za-z0-9_]+/g, "abc123");
}

describe("robots.txt coverage", () => {
  it("parsed a meaningful route set", () => {
    expect(PRIVATE_ROUTES.length).toBeGreaterThan(20);
    expect(PRIVATE_ROUTES).toContain("/credit-history");
    expect(PRIVATE_ROUTES).toContain("/pay/:invoiceId");
    expect(PRIVATE_ROUTES).toContain("/admin/users/:id");
  });

  it("disallows every private route declared in App.tsx", () => {
    const missing = PRIVATE_ROUTES.filter(
      (route) => !isDisallowed(sample(route)),
    );
    expect(missing).toEqual([]);
  });

  it("keeps the public surface crawlable", () => {
    const blocked = ["/", "/products", "/products/scan", "/sitemap.xml", "/robots.txt", ...PUBLIC_NON_SPA]
      .filter(isDisallowed);
    expect(blocked).toEqual([]);
  });

  it("keeps the JSON/SSE surfaces out of the crawl queue", () => {
    for (const path of ["/api/auth/login", "/v1/chat/completions", "/metrics", "/health"]) {
      expect({ path, blocked: isDisallowed(path) }).toEqual({
        path,
        blocked: true,
      });
    }
  });

  it("points the sitemap directive at the canonical origin", () => {
    expect(SITEMAP).toEqual(["https://sinexis.app/sitemap.xml"]);
  });

  it("declares no duplicate rules", () => {
    expect(DISALLOW).toEqual([...new Set(DISALLOW)]);
  });
});
