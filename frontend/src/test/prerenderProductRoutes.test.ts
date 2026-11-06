import { describe, expect, it } from "vitest";

import {
  buildRouteHtml,
  readProductRoutes,
} from "../../scripts/prerender-product-routes.mjs";

type NodeFs = { readFileSync: (path: string, encoding: "utf8") => string };

const nodeProcess = (
  globalThis as unknown as {
    process: { cwd: () => string; getBuiltinModule: (id: string) => NodeFs };
  }
).process;

const FRONTEND_ROOT = nodeProcess.cwd();
const BASE_HTML = nodeProcess
  .getBuiltinModule("node:fs")
  .readFileSync(`${FRONTEND_ROOT}/index.html`, "utf8");

function metaContent(html: string, attr: "name" | "property", key: string) {
  const tag = new RegExp(`<meta[^>]*\\b${attr}="${key}"[^>]*>`, "s");
  const match = html.match(tag);
  if (!match) return null;
  return match[0].match(/content="([^"]*)"/s)?.[1] ?? null;
}

describe("buildRouteHtml", () => {
  it("rewrites every tag a non-JS crawler reads", () => {
    const html = buildRouteHtml(BASE_HTML, {
      title: "Sinexis Scan — uji",
      description: "Deskripsi scan.",
      url: "https://sinexis.app/products/scan",
    });

    expect(html.match(/<title>([^<]*)<\/title>/)?.[1]).toBe(
      "Sinexis Scan — uji",
    );
    expect(metaContent(html, "name", "description")).toBe("Deskripsi scan.");
    expect(metaContent(html, "property", "og:title")).toBe(
      "Sinexis Scan — uji",
    );
    expect(metaContent(html, "property", "og:description")).toBe(
      "Deskripsi scan.",
    );
    expect(metaContent(html, "property", "og:url")).toBe(
      "https://sinexis.app/products/scan",
    );
    expect(metaContent(html, "name", "twitter:title")).toBe(
      "Sinexis Scan — uji",
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://sinexis.app/products/scan"',
    );
  });

  it("keeps the app mount point and bundle so the SPA still boots", () => {
    const html = buildRouteHtml(BASE_HTML, {
      title: "t",
      description: "d",
      url: "https://sinexis.app/products",
    });

    expect(html).toContain('id="root"');
    expect(html).toContain('type="module"');
    expect(html).toContain("main.tsx");
  });

  it("escapes quotes so a description cannot break out of the attribute", () => {
    const html = buildRouteHtml(BASE_HTML, {
      title: 'a" onload="x',
      description: 'b" c',
      url: "https://sinexis.app/products",
    });

    expect(html).not.toContain('content="b" c"');
    expect(html).toContain("&quot;");
  });
});

describe("readProductRoutes", () => {
  it("covers the hub plus every published slug", () => {
    const routes = readProductRoutes(FRONTEND_ROOT);
    const paths = routes.map((route) => route.path);

    expect(paths[0]).toBe("/products");
    expect(paths).toContain("/products/scan");
    expect(paths).toContain("/products/guard");
    expect(paths).toContain("/products/host");
    expect(paths).toContain("/products/uptime");
    expect(paths).toContain("/products/ai-gateway");
    expect(routes).toHaveLength(6);
  });

  it("gives every route a real title and description", () => {
    for (const route of readProductRoutes(FRONTEND_ROOT)) {
      expect(route.title.length).toBeGreaterThan(10);
      expect(route.description.length).toBeGreaterThan(40);
      expect(route.title).not.toContain("{{");
    }
  });
});
