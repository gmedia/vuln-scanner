#!/usr/bin/env node
// Prometheus rules only fail at scrape time when a metric name drifts, and the
// failure is silent: the alert simply never fires. Cross-check the names the
// rules reference against the names `backend/app/metrics.py` actually exports.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const metricsPath = join(root, "backend/app/metrics.py");
const alertsPath = join(root, "monitoring/alerts-vuln-scanner.example.yml");

const METRIC = /vuln_[a-z0-9_]+/g;

function unique(values) {
  return [...new Set(values)].sort();
}

const metricsSource = readFileSync(metricsPath, "utf8");
const exported = unique(metricsSource.match(METRIC) ?? []);

const alertsSource = readFileSync(alertsPath, "utf8");
const ruleCount = (alertsSource.match(/^\s*-\s*alert:/gm) ?? []).length;
const referenced = unique(alertsSource.match(METRIC) ?? []);

const problems = [];

if (exported.length === 0) {
  problems.push(`${metricsPath}: no vuln_* metric names found — parser or file moved`);
}
if (ruleCount === 0) {
  problems.push(`${alertsPath}: no alert rules found`);
}
if (referenced.length === 0) {
  problems.push(`${alertsPath}: no vuln_* metric referenced by any rule`);
}

const unknownToCode = referenced.filter((name) => !exported.includes(name));
for (const name of unknownToCode) {
  problems.push(`${alertsPath}: rule references "${name}" which metrics.py does not export (alert would never fire)`);
}

const unalerted = exported.filter((name) => !referenced.includes(name));
for (const name of unalerted) {
  problems.push(`${metricsPath}: exports "${name}" but no rule references it (no alert coverage)`);
}

if (problems.length > 0) {
  console.error("check-alert-metrics: FAILED");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `check-alert-metrics: OK — ${ruleCount} rules, ${referenced.length} metric names match metrics.py exactly`,
);
