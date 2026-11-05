#!/usr/bin/env node
/**
 * nginx header-inheritance guard.
 *
 * nginx drops EVERY inherited `add_header` as soon as a `location` block
 * declares its own. That is how /terms, /privacy, /blog, /status and /install
 * silently served without a CSP for months: each re-declared X-Robots-Tag and
 * four security headers, but never Content-Security-Policy.
 *
 * This check fails when:
 *   1. a location block declares add_header but not Content-Security-Policy
 *      (unless the path is in CSP_NOT_APPLICABLE), or
 *   2. the public vhost loses `location = /sitemap.xml`, or
 *   3. either compose/dev proxy stops routing /sitemap.xml to the backend, or
 *   4. the host+path robots map is dropped from the public vhost.
 *
 * Usage: node scripts/check-nginx-headers.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const EDGE = join(root, "nginx", "sinexis.app.conf");
const COMPOSE = join(root, "nginx", "default.conf");
const VITE = join(root, "frontend", "vite.config.ts");

/**
 * Location blocks that legitimately serve non-HTML (JSON / SSE) payloads, where
 * a CSP is meaningless and `X-Accel-Buffering` must be set per-location.
 */
const CSP_NOT_APPLICABLE = ["^~ /v1/"];

const failures = [];

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    failures.push(`cannot read ${path}`);
    return "";
  }
}

/** Split a config into top-level `location ... { ... }` blocks. */
function locationBlocks(source) {
  const blocks = [];
  const lines = source.split("\n");
  let current = null;
  let depth = 0;

  for (const line of lines) {
    if (current === null) {
      const match = line.match(/^\s*location\s+([^{]+?)\s*\{\s*$/);
      if (match) {
        current = { path: match[1].trim(), lines: [line] };
        depth = 1;
      }
      continue;
    }

    current.lines.push(line);
    depth += (line.match(/\{/g) ?? []).length;
    depth -= (line.match(/\}/g) ?? []).length;
    if (depth <= 0) {
      blocks.push(current);
      current = null;
      depth = 0;
    }
  }
  return blocks;
}

const edge = read(EDGE);
const compose = read(COMPOSE);
const vite = read(VITE);

// 1) No location may drop the inherited CSP.
for (const block of locationBlocks(edge)) {
  const text = block.lines.join("\n");
  const declaresHeader = /^\s*add_header\s/m.test(text);
  if (!declaresHeader) continue;
  if (CSP_NOT_APPLICABLE.includes(block.path)) continue;
  if (/^\s*add_header\s+Content-Security-Policy\s/m.test(text)) continue;

  failures.push(
    `location ${block.path} declares add_header without Content-Security-Policy; ` +
      "nginx will drop the inherited CSP for this path. Remove the add_header set " +
      "and let the server-level headers (and the robots map) apply, or re-declare CSP.",
  );
}

// 2) The public vhost must keep the sitewide sitemap route.
if (edge && !/location\s*=\s*\/sitemap\.xml\s*\{/.test(edge)) {
  failures.push("nginx/sinexis.app.conf has no `location = /sitemap.xml`; the SPA will answer /sitemap.xml with HTML.");
}

// 3) Both dev/compose proxies must forward the sitemap to FastAPI.
const composeSitemap = (compose.match(/location\s*=\s*\/sitemap\.xml\s*\{/g) ?? []).length;
if (compose && composeSitemap < 2) {
  failures.push(
    `nginx/default.conf has ${composeSitemap} \`location = /sitemap.xml\` block(s); expected 2 (HTTP + HTTPS).`,
  );
}
if (vite && !/"\/sitemap\.xml"/.test(vite)) {
  failures.push('frontend/vite.config.ts has no "/sitemap.xml" proxy; Vite serves the SPA shell instead of XML.');
}

// 4) The host+path robots map must survive: one header, no per-server override.
if (edge) {
  if (!/^\s*map\s+\$host\s+\$robots_for_host\s*\{/m.test(edge)) {
    failures.push("nginx/sinexis.app.conf lost `map $host $robots_for_host`; custom status hosts may become indexable.");
  }
  if (!/^\s*map\s+\$request_uri\s+\$robots_for_path\s*\{/m.test(edge)) {
    failures.push("nginx/sinexis.app.conf lost `map $request_uri $robots_for_path`; /status and /install may become indexable.");
  }
  const robotsHeader = edge.match(/^\s*add_header\s+X-Robots-Tag\s+\$robots_tag\b([^;]*);/m);
  if (!robotsHeader) {
    failures.push("nginx/sinexis.app.conf does not emit one server-level `X-Robots-Tag $robots_tag`.");
  } else if (!/\balways\b/.test(robotsHeader[1])) {
    failures.push(
      "the server-level `X-Robots-Tag $robots_tag` must use `always`; a bare add_header is " +
        "only emitted for 2xx/3xx, so 404/405 responses (custom-host apex, unknown /status " +
        "slugs) would ship without it — exactly the hosts that must stay noindex.",
    );
  }
}

if (failures.length > 0) {
  console.error("nginx header guard: FAILED\n");
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`\n${failures.length} problem(s).`);
  process.exit(1);
}

console.log("nginx header guard: OK (CSP inheritance, robots map, sitemap routes).");
