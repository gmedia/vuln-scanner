#!/usr/bin/env node
// Validation-type drift gate.
//
// A `PydanticCustomError("type", ...)` is localized by the SPA through
// `errors:validation.<type>`. A type without an en/id key silently falls back
// to English prose, so adding a validator without its translation is a bug.
//
// Usage: node scripts/check-validation-types.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BACKEND = join(ROOT, "backend", "app");
const LOCALES = join(ROOT, "frontend", "src", "locales");
const TYPE_RE = /PydanticCustomError\(\s*"([a-z0-9_]+)"/g;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (entry.endsWith(".py")) files.push(full);
  }
  return files;
}

const used = new Map();
for (const file of walk(BACKEND)) {
  const text = readFileSync(file, "utf8");
  let match;
  while ((match = TYPE_RE.exec(text)) !== null) {
    const rel = relative(ROOT, file);
    const lines = used.get(match[1]) ?? [];
    lines.push(rel);
    used.set(match[1], lines);
  }
}

if (used.size === 0) {
  console.error("validation-types: no PydanticCustomError types found (wrong path?)");
  process.exit(1);
}

const missing = [];
for (const lang of ["en", "id"]) {
  const catalog = JSON.parse(
    readFileSync(join(LOCALES, lang, "errors.json"), "utf8"),
  );
  const known = new Set(Object.keys(catalog.validation ?? {}));
  for (const [type, files] of used) {
    if (!known.has(type)) missing.push({ lang, type, files });
  }
}

if (missing.length > 0) {
  console.error(`validation-types: ${missing.length} missing locale key(s)\n`);
  for (const { lang, type, files } of missing) {
    console.error(`  ${lang}: errors.validation.${type}  (${files.join(", ")})`);
  }
  console.error(
    "\nAdd the key to frontend/src/locales/{en,id}/errors.json. Contract: docs/specs/form-feedback.md.",
  );
  process.exit(1);
}

console.log(`validation-types: ok (${used.size} types, en + id)`);
