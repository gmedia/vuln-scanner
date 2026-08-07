#!/usr/bin/env node
/**
 * Wave E — full-site visual QA screenshots (18 routes).
 *
 * Captures full-page PNGs at 1440×900 against BASE_URL (default prod).
 * Auth: POST /api/auth/login with e2e credentials, inject tokens into localStorage.
 *
 * Usage:
 *   node scripts/wave-e-screenshots.mjs
 *   BASE_URL=https://vs.appmedia.id node scripts/wave-e-screenshots.mjs
 *   OUT_DIR=.playwright-mcp/screenshots-wave-e node scripts/wave-e-screenshots.mjs
 *
 * Env:
 *   BASE_URL      default https://vs.appmedia.id
 *   E2E_EMAIL      default e2e@vulnscan.dev
 *   E2E_PASSWORD   required (no default in public repo)
 *   OUT_DIR        default .playwright-mcp/screenshots-wave-e
 *   VIEWPORT_W/H   default 1440 / 900
 */

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const require = createRequire(join(ROOT, "frontend", "package.json"));
const { chromium } = require("@playwright/test");

const BASE_URL = (process.env.BASE_URL || "https://vs.appmedia.id").replace(/\/$/, "");
const E2E_EMAIL = process.env.E2E_EMAIL || "e2e@vulnscan.dev";
const E2E_PASSWORD = process.env.E2E_PASSWORD || "";
if (!E2E_PASSWORD) {
  console.error("E2E_PASSWORD is required (do not hardcode credentials in the repo).");
  process.exit(1);
}
const OUT_DIR = process.env.OUT_DIR
  ? join(ROOT, process.env.OUT_DIR)
  : join(ROOT, ".playwright-mcp", "screenshots-wave-e");
const VIEWPORT = {
  width: Number(process.env.VIEWPORT_W || 1440),
  height: Number(process.env.VIEWPORT_H || 900),
};

/** @type {{ id: string, path: string, auth?: boolean, wait?: string, settleMs?: number }[]} */
const ROUTES = [
  { id: "01-landing", path: "/", auth: false },
  { id: "02-login", path: "/login", auth: false },
  { id: "03-register", path: "/register", auth: false },
  { id: "04-verify-email", path: "/verify-email", auth: false },
  { id: "05-forgot-password", path: "/forgot-password", auth: false },
  { id: "06-reset-password", path: "/reset-password", auth: false },
  { id: "07-not-found", path: "/this-route-does-not-exist-wave-e", auth: false },
  { id: "08-dashboard", path: "/dashboard", auth: true },
  { id: "09-scan-ip", path: "/scan/ip", auth: true },
  { id: "10-scan-domain", path: "/scan/domain", auth: true },
  { id: "11-scan-mobile", path: "/scan/mobile", auth: true },
  // 12 filled at runtime if a scan id is available
  { id: "13-credit-history", path: "/credit-history", auth: true },
  { id: "14-profile", path: "/profile", auth: true },
  { id: "15-admin-dashboard", path: "/admin", auth: true },
  { id: "16-admin-users", path: "/admin/users", auth: true },
  // 17 filled at runtime with first admin user id
  { id: "18-admin-pricing", path: "/admin/pricing", auth: true },
];

const ERROR_MARKERS = [
  "is not a function",
  "Something went wrong",
  "hasError",
  "ChunkLoadError",
  "Minified React error",
  "Application error",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function loginViaApi(request) {
  const res = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD },
  });
  if (res.status() !== 200) {
    throw new Error(`login failed ${res.status()}: ${await res.text()}`);
  }
  const body = await res.json();
  if (!body.access_token) throw new Error("login missing access_token");
  return body;
}

async function resolveDynamicRoutes(request, accessToken) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  let scanId = null;
  let userId = null;

  try {
    const hist = await request.get(
      `${BASE_URL}/api/scan/history?page=1&limit=20`,
      { headers },
    );
    if (hist.ok()) {
      const data = await hist.json();
      const items = data.items || data.scans || [];
      const completed = items.find((i) => i.status === "completed" && i.id);
      const any = items.find((i) => i.id);
      if (completed?.id) scanId = completed.id;
      else if (any?.id) scanId = any.id;
    }
  } catch {
    /* optional */
  }

  try {
    const users = await request.get(`${BASE_URL}/api/admin/users?page=1&page_size=5`, {
      headers,
    });
    if (users.ok()) {
      const data = await users.json();
      const list = data.users || data.items || [];
      if (list[0]?.id) userId = list[0].id;
    }
  } catch {
    /* optional */
  }

  return { scanId, userId };
}

async function captureRoute(page, route, report) {
  const url = `${BASE_URL}${route.path}`;
  const file = join(OUT_DIR, `${route.id}.png`);
  const entry = {
    id: route.id,
    path: route.path,
    url,
    file,
    ok: false,
    finalUrl: "",
    title: "",
    errorHits: [],
    consoleErrors: [],
  };

  const consoleErrors = [];
  const onConsole = (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  };
  const onPageError = (err) => consoleErrors.push(String(err));
  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    await sleep(route.settleMs ?? 800);
    if (route.wait) {
      await page.waitForSelector(route.wait, { timeout: 15_000 }).catch(() => null);
    }

    entry.finalUrl = page.url();
    entry.title = await page.title();
    const bodyText = await page.locator("body").innerText().catch(() => "");
    entry.errorHits = ERROR_MARKERS.filter((m) => bodyText.includes(m));
    entry.consoleErrors = consoleErrors.slice(0, 10);

    // Redirect to login on auth routes is a hard fail
    if (route.auth && entry.finalUrl.includes("/login")) {
      entry.ok = false;
      entry.errorHits.push("redirected-to-login");
    } else {
      entry.ok = entry.errorHits.length === 0;
    }

    await page.screenshot({ path: file, fullPage: true });
  } catch (err) {
    entry.ok = false;
    entry.errorHits.push(`capture-error: ${err}`);
    try {
      await page.screenshot({ path: file, fullPage: true });
    } catch {
      /* ignore */
    }
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }

  report.push(entry);
  const status = entry.ok ? "OK  " : "FAIL";
  console.log(
    `${status} ${entry.id.padEnd(22)} ${entry.path} → ${entry.finalUrl.replace(BASE_URL, "") || "/"}` +
      (entry.errorHits.length ? ` [${entry.errorHits.join("; ")}]` : ""),
  );
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`BASE_URL=${BASE_URL}`);
  console.log(`OUT_DIR=${OUT_DIR}`);
  console.log(`viewport=${VIEWPORT.width}x${VIEWPORT.height}`);

  const browser = await chromium.launch({
    headless: true,
    ignoreHTTPSErrors: true,
  });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    ignoreHTTPSErrors: true,
  });

  const login = await loginViaApi(context.request);
  const { scanId, userId } = await resolveDynamicRoutes(
    context.request,
    login.access_token,
  );
  console.log(`scanId=${scanId || "(none)"} userId=${userId || "(none)"}`);

  await context.addInitScript(
    ({ accessToken, refreshToken }) => {
      window.localStorage.setItem("accessToken", accessToken);
      if (refreshToken) {
        window.localStorage.setItem("refreshToken", refreshToken);
      }
    },
    {
      accessToken: login.access_token,
      refreshToken: login.refresh_token,
    },
  );

  /** @type {typeof ROUTES} */
  const routes = [...ROUTES];
  if (scanId) {
    routes.splice(11, 0, {
      id: "12-scan-detail",
      path: `/scan/${scanId}`,
      auth: true,
      settleMs: 1200,
    });
  } else {
    routes.splice(11, 0, {
      id: "12-scan-detail",
      path: "/scan/00000000-0000-0000-0000-000000000000",
      auth: true,
      settleMs: 800,
    });
    console.log("warn: no scan history — capturing empty/not-found scan detail");
  }
  if (userId) {
    routes.splice(
      routes.findIndex((r) => r.id === "18-admin-pricing"),
      0,
      {
        id: "17-admin-user-detail",
        path: `/admin/users/${userId}`,
        auth: true,
        settleMs: 1000,
      },
    );
  } else {
    console.log("warn: no admin users — skipping 17-admin-user-detail");
  }

  const page = await context.newPage();
  /** @type {object[]} */
  const report = [];

  for (const route of routes) {
    await captureRoute(page, route, report);
  }

  await browser.close();

  const summary = {
    baseUrl: BASE_URL,
    outDir: OUT_DIR,
    capturedAt: new Date().toISOString(),
    viewport: VIEWPORT,
    email: E2E_EMAIL,
    total: report.length,
    ok: report.filter((r) => r.ok).length,
    fail: report.filter((r) => !r.ok).length,
    routes: report,
  };
  const reportPath = join(OUT_DIR, "wave-e-report.json");
  writeFileSync(reportPath, JSON.stringify(summary, null, 2));
  console.log(`\nreport: ${reportPath}`);
  console.log(`summary: ${summary.ok}/${summary.total} ok, ${summary.fail} fail`);

  if (summary.fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
