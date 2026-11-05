#!/usr/bin/env node
/**
 * Keep the TypeScript service registry, the Python sitemap tuple, and the nginx
 * product-slug allowlist in sync.
 *
 * S0 ships no registry (frontend/src/lib/services.ts), so this is a no-op there.
 * S1 adds both the registry and the derived tuple; from then on a new published
 * service without a sitemap entry (or the reverse) fails this check.
 *
 * nginx needs the slug list too: `/products/<unknown>` must answer 404 instead of
 * a 200 app shell (soft 404). Without this guard that third copy drifts silently.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = join(root, "frontend", "src", "lib", "services.ts");
const sitemapPath = join(root, "backend", "app", "api", "sitemap_html.py");
const nginxPath = join(root, "frontend", "nginx.conf");

function fail(message) {
  console.error(`public registry sync: ${message}`);
  process.exit(1);
}

if (!existsSync(registryPath)) {
  console.log(
    "public registry sync: frontend/src/lib/services.ts is not present yet (S0); skipping.",
  );
  process.exit(0);
}

if (!existsSync(sitemapPath)) {
  fail("backend/app/api/sitemap_html.py is missing");
}

const registry = readFileSync(registryPath, "utf8");
const sitemap = readFileSync(sitemapPath, "utf8");

const entries = [];
const entryPattern = /slug:\s*"([^"]+)"[\s\S]*?published:\s*(true|false)/g;
for (const match of registry.matchAll(entryPattern)) {
  entries.push({ slug: match[1], published: match[2] === "true" });
}

if (entries.length === 0) {
  fail("no service entries could be parsed from frontend/src/lib/services.ts");
}

const tuplePattern =
  /^[A-Z0-9_]*(?:PRODUCT|SERVICE|SLUG)[A-Z0-9_]*\s*=\s*\(([\s\S]*?)\)/m;
const tuple = sitemap.match(tuplePattern);
if (!tuple) {
  fail(
    "sitemap_html.py has no derived product/service slug tuple (expected a PRODUCT/SERVICE/SLUG constant)",
  );
}

const pythonSlugs = [...tuple[1].matchAll(/"([^"]+)"/g)].map(
  (match) => match[1],
);
const expectedSlugs = entries
  .filter((entry) => entry.published)
  .map((entry) => entry.slug);

const missing = expectedSlugs.filter((slug) => !pythonSlugs.includes(slug));
const extra = pythonSlugs.filter((slug) => !expectedSlugs.includes(slug));

if (missing.length > 0 || extra.length > 0) {
  if (missing.length > 0) {
    console.error(`missing from sitemap_html.py: ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    console.error(`not in the TS registry: ${extra.join(", ")}`);
  }
  fail("published registry entries and the sitemap slug tuple have drifted");
}

console.log(
  `public registry sync: ${expectedSlugs.length} published service URL(s) match.`,
);

if (!existsSync(nginxPath)) {
  fail("frontend/nginx.conf is missing");
}

const nginx = readFileSync(nginxPath, "utf8");
const nginxBlock = nginx.match(
  /# PRODUCT-SLUGS-BEGIN[\s\S]*?# PRODUCT-SLUGS-END/,
);
if (!nginxBlock) {
  fail(
    "frontend/nginx.conf has no PRODUCT-SLUGS-BEGIN/END block; unknown product slugs would soft-404",
  );
}

const nginxAlternation = nginxBlock[0].match(/location ~ "\^\/products\/\(([^)]+)\)/);
if (!nginxAlternation) {
  fail(
    "frontend/nginx.conf PRODUCT-SLUGS block has no ^/products/(...)$ location regex",
  );
}

const nginxSlugs = nginxAlternation[1].split("|").map((slug) => slug.trim());
const missingInNginx = expectedSlugs.filter(
  (slug) => !nginxSlugs.includes(slug),
);
const extraInNginx = nginxSlugs.filter(
  (slug) => !expectedSlugs.includes(slug),
);

if (missingInNginx.length > 0 || extraInNginx.length > 0) {
  if (missingInNginx.length > 0) {
    console.error(`missing from frontend/nginx.conf: ${missingInNginx.join(", ")}`);
  }
  if (extraInNginx.length > 0) {
    console.error(`not in the TS registry: ${extraInNginx.join(", ")}`);
  }
  fail("published registry entries and the nginx product-slug list have drifted");
}

console.log(
  `public registry sync: ${nginxSlugs.length} product slug(s) match frontend/nginx.conf.`,
);
