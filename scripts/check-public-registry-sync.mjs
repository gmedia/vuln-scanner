#!/usr/bin/env node
/**
 * Keep the TypeScript service registry and the Python sitemap tuple in sync.
 *
 * S0 ships no registry (frontend/src/lib/services.ts), so this is a no-op there.
 * S1 adds both the registry and the derived tuple; from then on a new published
 * service without a sitemap entry (or the reverse) fails this check.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = join(root, "frontend", "src", "lib", "services.ts");
const sitemapPath = join(root, "backend", "app", "api", "sitemap_html.py");

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
