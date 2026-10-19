#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = join(root, "frontend");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".md") ? [full] : [];
  });
}

const docs = [join(frontend, "DESIGN.md"), ...walk(join(frontend, "design"))];
const LINK = /\[[^\]]*\]\(([^)]+)\)/g;

let checked = 0;
const broken = [];
for (const doc of docs) {
  const text = readFileSync(doc, "utf8");
  for (const match of text.matchAll(LINK)) {
    const target = match[1];
    if (/^(https?:|#|mailto:)/.test(target)) continue;
    const file = target.split("#")[0];
    if (!file) continue;
    checked += 1;
    if (!existsSync(resolve(dirname(doc), file))) {
      broken.push(`${doc.slice(root.length + 1)}: ${target}`);
    }
  }
}

if (checked < 10) {
  console.error(`check-design-links: only ${checked} links found — refusing to pass`);
  process.exit(1);
}
if (broken.length > 0) {
  console.error("check-design-links: broken relative links");
  for (const line of broken) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`check-design-links: ${checked} links OK across ${docs.length} files`);
