#!/usr/bin/env node
/**
 * Dependency-audit gate for the frontend.
 *
 * `npm audit` is never run in CI, so a security override can silently drift
 * below the first patched version while still looking like a fix — that is
 * exactly what happened with `brace-expansion` / `undici` (see SECURITY.md).
 *
 * Fails on any HIGH or CRITICAL advisory that is not listed in
 * `.github/dependency-audit-allowlist.json`. Accepted risks therefore need an
 * explicit, reviewable entry rather than a silent override.
 *
 * Usage: node scripts/check-dependency-audit.mjs
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendDir = join(repoRoot, "frontend");
const allowlistPath = join(repoRoot, ".github", "dependency-audit-allowlist.json");

const BLOCKING = new Set(["high", "critical"]);

function readAllowlist() {
  if (!existsSync(allowlistPath)) return [];
  const raw = JSON.parse(readFileSync(allowlistPath, "utf8"));
  const entries = Array.isArray(raw) ? raw : raw.entries;
  if (!Array.isArray(entries)) {
    throw new Error(`${allowlistPath}: expected an array or { "entries": [] }`);
  }
  return entries;
}

function runAudit() {
  try {
    return execFileSync("npm", ["audit", "--json"], {
      cwd: frontendDir,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      // npm exits non-zero when vulnerabilities exist; we parse stdout either way.
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    if (err.stdout) return err.stdout;
    throw err;
  }
}

/** Advisories are the object entries in `via`; string entries are just parent names. */
function advisoriesFor(pkg, vuln) {
  const via = Array.isArray(vuln.via) ? vuln.via : [];
  return via
    .filter((v) => v && typeof v === "object")
    .map((v) => {
      const url = String(v.url ?? "");
      const ghsa = /GHSA-[a-z0-9-]+/i.exec(url)?.[0]?.toUpperCase() ?? null;
      return {
        pkg,
        id: ghsa ?? String(v.source ?? "unknown"),
        title: String(v.title ?? "").trim(),
        severity: String(v.severity ?? vuln.severity ?? "").toLowerCase(),
        range: String(v.range ?? vuln.range ?? ""),
        url,
      };
    });
}

function main() {
  let allowlist;
  try {
    allowlist = readAllowlist();
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    process.exit(2);
  }

  const raw = runAudit();
  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    console.error("FAIL: could not parse `npm audit --json` output");
    console.error(raw.slice(0, 800));
    process.exit(2);
  }

  const findings = [];
  for (const [pkg, vuln] of Object.entries(report.vulnerabilities ?? {})) {
    for (const adv of advisoriesFor(pkg, vuln)) {
      if (BLOCKING.has(adv.severity)) findings.push(adv);
    }
  }

  const allowedIds = new Set(allowlist.map((e) => `${e.id}|${e.package}`));
  const unlisted = findings.filter((f) => !allowedIds.has(`${f.id}|${f.pkg}`));

  // An allowlist entry that no longer matches anything is stale: the fix landed
  // or the advisory was withdrawn. Warn so it gets removed, but do not fail —
  // a stale entry must never block an unrelated PR.
  const foundIds = new Set(findings.map((f) => `${f.id}|${f.pkg}`));
  const stale = allowlist.filter((e) => !foundIds.has(`${e.id}|${e.package}`));

  const now = Date.now();
  const expired = allowlist.filter((e) => e.expires && Date.parse(e.expires) < now);

  if (stale.length > 0) {
    console.warn("WARN: allowlist entries no longer detected (remove them):");
    for (const e of stale) console.warn(`  ${e.package} ${e.id}`);
  }

  if (expired.length > 0) {
    console.error("FAIL: allowlist entries have expired — re-review or fix:");
    for (const e of expired) console.error(`  ${e.package} ${e.id} (expired ${e.expires})`);
  }

  if (unlisted.length > 0) {
    console.error(`FAIL: ${unlisted.length} unaccepted HIGH/CRITICAL advisory(ies):`);
    for (const f of unlisted) {
      console.error(`  [${f.severity}] ${f.pkg} — ${f.id} (${f.range})`);
      if (f.title) console.error(`      ${f.title}`);
      if (f.url) console.error(`      ${f.url}`);
    }
    console.error("");
    console.error("Fix it (prefer a patched release), or record an accepted risk in");
    console.error(`${allowlistPath} with a reason and an expiry.`);
    console.error("Never leave an override one patch below the first patched version.");
  }

  if (unlisted.length > 0 || expired.length > 0) process.exit(1);

  const total = report.metadata?.vulnerabilities?.total ?? 0;
  console.log(
    `OK: no unaccepted HIGH/CRITICAL advisories (total advisories: ${total}, accepted: ${allowlist.length}).`,
  );
}

main();
