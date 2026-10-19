#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "frontend", "src");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".md") ? [full] : [];
  });
}

const RETIRED = ["SiemEmptyIsland"];

const docs = [
  ...walk(join(root, "docs")),
  join(root, "frontend", "AGENTS.md"),
];

const SOURCE_PATH = /`((?:components|pages|lib|hooks|theme)\/[^`]+?\.tsx?)`/g;

let checkedPaths = 0;
const missing = [];
const retired = [];

for (const doc of docs) {
  const text = readFileSync(doc, "utf8");
  const rel = doc.slice(root.length + 1);
  for (const match of text.matchAll(SOURCE_PATH)) {
    const path = match[1];
    checkedPaths += 1;
    if (!existsSync(join(src, path))) missing.push(`${rel}: ${path}`);
  }
  for (const name of RETIRED) {
    if (text.includes(name)) retired.push(`${rel}: ${name}`);
  }
}

if (checkedPaths < 20) {
  console.error(
    `check-design-docs: only ${checkedPaths} source paths found — refusing to pass`,
  );
  process.exit(1);
}

if (missing.length > 0) {
  console.error("check-design-docs: docs point at source files that do not exist");
  for (const line of [...new Set(missing)]) console.error(`  ${line}`);
  process.exit(1);
}

if (retired.length > 0) {
  console.error("check-design-docs: docs name a retired primitive");
  for (const line of [...new Set(retired)]) console.error(`  ${line}`);
  process.exit(1);
}

console.log(
  `check-design-docs: ${checkedPaths} source paths OK across ${docs.length} docs`,
);
