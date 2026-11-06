import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const DEFAULT_LOCALE = "id";

function escapeAttribute(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceMetaContent(html, attr, key, content) {
  const tag = new RegExp(`<meta[^>]*\\b${attr}="${key}"[^>]*>`);
  const match = html.match(tag);
  if (!match) return html;
  const rewritten = match[0].replace(
    /content="[^"]*"/,
    `content="${escapeAttribute(content)}"`,
  );
  return html.replace(match[0], rewritten);
}

/**
 * Rewrite the SPA shell's head into a route-specific document.
 *
 * Only the tags a crawler or link scraper reads are touched; the body and the
 * module script stay as-is, so the app boots normally and `usePageMeta` takes
 * over once React mounts.
 */
export function buildRouteHtml(baseHtml, { title, description, url }) {
  let html = baseHtml.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeAttribute(title)}</title>`,
  );
  html = replaceMetaContent(html, "name", "description", description);
  html = replaceMetaContent(html, "property", "og:title", title);
  html = replaceMetaContent(html, "property", "og:description", description);
  html = replaceMetaContent(html, "property", "og:url", url);
  html = replaceMetaContent(html, "name", "twitter:title", title);
  html = replaceMetaContent(html, "name", "twitter:description", description);
  html = html.replace(
    /<link rel="canonical" href="[^"]*"/,
    `<link rel="canonical" href="${escapeAttribute(url)}"`,
  );
  return html;
}

export function readProductRoutes(root, locale = DEFAULT_LOCALE) {
  const registry = readFileSync(
    join(root, "src", "lib", "services.ts"),
    "utf8",
  );
  const messages = JSON.parse(
    readFileSync(join(root, "src", "locales", locale, "products.json"), "utf8"),
  );

  const published = [
    ...registry.matchAll(/slug:\s*"([^"]+)"[\s\S]*?published:\s*(true|false)/g),
  ]
    .filter((match) => match[2] === "true")
    .map((match) => match[1]);

  const routes = [
    {
      path: "/products",
      title: messages.hub.metaTitle,
      description: messages.hub.metaDescription,
    },
  ];

  for (const slug of published) {
    const entry = messages.services[slug];
    if (!entry) continue;
    routes.push({
      path: `/products/${slug}`,
      title: entry.metaTitle,
      description: entry.metaDescription,
    });
  }

  return routes;
}

/**
 * Emit a static document per product route so a crawler that never runs
 * JavaScript still sees the right title, description and canonical URL.
 *
 * `/products/scan` is served from `products/scan.html` by nginx `try_files`,
 * which keeps the fix inside the CI-deployed frontend image: no edge config
 * change and no SSR runtime.
 */
export function prerenderProductRoutes({
  origin = "https://sinexis.app",
} = {}) {
  let root = process.cwd();
  let outDir = "dist";

  return {
    name: "prerender-product-routes",
    apply: "build",
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },
    closeBundle() {
      const distDir = resolve(root, outDir);
      const baseHtml = readFileSync(join(distDir, "index.html"), "utf8");
      const routes = readProductRoutes(root);

      for (const route of routes) {
        const target = join(distDir, `${route.path.slice(1)}.html`);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(
          target,
          buildRouteHtml(baseHtml, {
            title: route.title,
            description: route.description,
            url: `${origin}${route.path}`,
          }),
        );
      }
    },
  };
}
