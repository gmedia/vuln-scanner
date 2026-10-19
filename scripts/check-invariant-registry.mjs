#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registry = join(root, "docs", "specs", "design-invariants.md");
const frontend = join(root, "frontend");

const text = readFileSync(registry, "utf8");

const ROW = /^\| (\d+) \| (.*)$/gm;
const rows = [...text.matchAll(ROW)].map((m) => ({
  id: Number(m[1]),
  body: m[2],
}));

if (rows.length < 10) {
  console.error(
    `check-invariant-registry: only ${rows.length} invariants parsed — refusing to pass`,
  );
  process.exit(1);
}

const problems = [];

// 1. IDs are unique and contiguous from 1.
const ids = rows.map((r) => r.id);
const expected = Array.from({ length: ids.length }, (_, i) => i + 1);
const duplicate = ids.filter((id, i) => ids.indexOf(id) !== i);
if (duplicate.length > 0) {
  problems.push(`duplicate invariant ids: ${[...new Set(duplicate)].join(", ")}`);
}
if (ids.join(",") !== expected.join(",")) {
  problems.push(`invariant ids must run 1..${ids.length} in order, got ${ids.join(",")}`);
}

// 2. Every cited test/script must exist.
const CITED = /`((?:[A-Za-z0-9_./-]*\/)?[A-Za-z0-9_.-]+\.(?:test\.tsx?|mjs))`/g;
const artifacts = new Set();
for (const row of rows) {
  for (const m of row.body.matchAll(CITED)) artifacts.add(m[1]);
}

const SEARCH = [
  (p) => join(frontend, "src", "test", p),
  (p) => join(frontend, "src", "test", "admin", p),
  (p) => join(root, p),
  (p) => join(root, "scripts", p),
  (p) => join(frontend, "e2e", p),
];

for (const artifact of artifacts) {
  if (!SEARCH.some((resolveTo) => existsSync(resolveTo(artifact)))) {
    problems.push(`cited artifact does not exist: ${artifact}`);
  }
}

// 3. Every invariant that claims machine enforcement must cite a test,
//    or delegate to another invariant that does.
for (const row of rows) {
  if (!/Machine:/i.test(row.body)) continue;
  const citesTest = CITED.test(row.body);
  CITED.lastIndex = 0;
  const delegates = /invariant \d+/i.test(row.body);
  if (!citesTest && !delegates) {
    problems.push(
      `invariant ${row.id} claims machine enforcement but cites no test`,
    );
  }
}

// 4. Every cited artifact must actually run in CI.
const ci = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
for (const artifact of artifacts) {
  const base = artifact.split("/").pop();
  if (!ci.includes(base)) {
    problems.push(`cited artifact is not wired into CI: ${artifact}`);
  }
}

if (problems.length > 0) {
  console.error("check-invariant-registry: registry is inconsistent");
  for (const line of problems) console.error(`  ${line}`);
  process.exit(1);
}

console.log(
  `check-invariant-registry: ${rows.length} invariants, ${artifacts.size} cited artifacts OK`,
);
