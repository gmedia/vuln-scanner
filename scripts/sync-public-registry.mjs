#!/usr/bin/env node
/**
 * Rewrite the Python sitemap product tuple from the TypeScript service registry.
 *
 * Run this after adding or unpublishing a service in
 * `frontend/src/lib/services.ts`, then commit the rewritten
 * `backend/app/api/sitemap_html.py` and verify with
 * `node scripts/check-public-registry-sync.mjs` (the same check CI runs).
 *
 * Idempotent: running it twice produces no second diff. It only touches the
 * tuple assignment — never the route body or the static path list.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = join(root, "frontend", "src", "lib", "services.ts");
const sitemapPath = join(root, "backend", "app", "api", "sitemap_html.py");

function fail(message) {
  console.error(`sync-public-registry: ${message}`);
  process.exit(1);
}

if (!existsSync(registryPath)) {
  fail("frontend/src/lib/services.ts is missing");
}
if (!existsSync(sitemapPath)) {
  fail("backend/app/api/sitemap_html.py is missing");
}

const registry = readFileSync(registryPath, "utf8");
const entries = [];
const entryPattern = /slug:\s*"([^"]+)"[\s\S]*?published:\s*(true|false)/g;
for (const match of registry.matchAll(entryPattern)) {
  entries.push({ slug: match[1], published: match[2] === "true" });
}

const published = entries
  .filter((entry) => entry.published)
  .map((entry) => entry.slug);

if (published.length === 0) {
  fail("no published service entries found in frontend/src/lib/services.ts");
}

const sitemap = readFileSync(sitemapPath, "utf8");
const tuplePattern =
  /^([A-Z0-9_]*(?:PRODUCT|SERVICE|SLUG)[A-Z0-9_]*\s*=\s*\()([\s\S]*?)(\))/m;
const match = sitemap.match(tuplePattern);
if (!match) {
  fail(
    "sitemap_html.py has no derived product/service slug tuple (expected a PRODUCT/SERVICE/SLUG constant)",
  );
}

const rendered = published.map((slug) => `"${slug}"`).join(", ");
const replacement = `${match[1]}${rendered}${match[3]}`;
const next = sitemap.replace(tuplePattern, replacement);

if (next === sitemap) {
  console.log(
    `sync-public-registry: already in sync (${published.length} published slug(s)).`,
  );
  process.exit(0);
}

writeFileSync(sitemapPath, next, "utf8");
console.log(
  `sync-public-registry: wrote ${published.length} published slug(s) to backend/app/api/sitemap_html.py.`,
);
