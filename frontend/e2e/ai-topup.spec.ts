import type { APIRequestContext, APIResponse } from "@playwright/test";

import { e2eEmail, e2ePassword } from "./credentials";
import { test, expect } from "./fixtures";

const baseURL = process.env.BASE_URL || "http://localhost";
const runId = Date.now().toString(36);

// Test-only catalog row. The code is fixed so reruns reuse the same pack
// instead of accumulating rows; the amount is arbitrary E2E data, not a
// product price.
const PACK_CODE = "E2E-MANUAL-10K";
const PACK_PAYLOAD = {
  code: PACK_CODE,
  label: "E2E 10k",
  amount_idr: 10000,
  bonus_idr: 0,
  active: true,
  sort_order: 0,
} as const;

// 1x1 transparent PNG. The backend sniffs magic bytes, so the upload must be a
// real (if tiny) image rather than a text file renamed to .png.
const PROOF_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

type OrgMembership = { id: string; name: string; sku: string };
type PackRow = {
  id: string;
  code: string;
  label: string;
  amount_idr: number;
  bonus_idr: number;
  active: boolean;
  sort_order: number;
};
type PackList = { items: PackRow[]; total: number };

async function body<T>(res: APIResponse): Promise<T> {
  return (await res.json()) as T;
}

test.describe.serial("AI top-up — manual transfer @ai @admin", () => {
  let api: APIRequestContext | undefined;
  let packId: string | undefined;
  let orderId: string | undefined;
  let suiteSkipReason: string | undefined;

  function requirePackId(): string {
    if (!packId) throw new Error("beforeAll did not resolve a top-up pack");
    return packId;
  }

  function requireOrderId(): string {
    if (!orderId) throw new Error("the happy-path test did not create an order");
    return orderId;
  }

  async function listPacks(): Promise<PackRow[]> {
    const res = await api!.get("/api/admin/ai/topup/packs");
    expect(res.status()).toBe(200);
    return (await body<PackList>(res)).items;
  }

  test.beforeAll(async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { "X-E2E-Test": "true" },
    });
    const login = await anonymous.post("/api/auth/login", {
      data: { email: e2eEmail(), password: e2ePassword() },
    });
    expect(login.status()).toBe(200);
    const tokens = await body<{ access_token?: string }>(login);
    await anonymous.dispose();
    expect(tokens.access_token).toBeTruthy();

    api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: {
        "X-E2E-Test": "true",
        Authorization: `Bearer ${tokens.access_token ?? ""}`,
      },
    });

    const orgsRes = await api.get("/api/orgs");
    expect(orgsRes.status()).toBe(200);
    const orgs = await body<OrgMembership[]>(orgsRes);
    if (orgs.length === 0) {
      throw new Error("E2E user has no organization; seed the stack first.");
    }

    // Customer top-up routes 404 while AI_GATEWAY_ENABLED is off. That is a
    // valid environment, not a failure — skip the whole suite.
    const probe = await api.get("/api/ai/topup/packs");
    if (probe.status() === 404) {
      suiteSkipReason =
        "AI_GATEWAY_ENABLED is off; AI top-up suite skipped.";
      test.skip(true, suiteSkipReason);
      return;
    }
    expect(probe.status()).toBe(200);

    let pack = (await listPacks()).find((row) => row.code === PACK_CODE);
    if (!pack) {
      const created = await api.post("/api/admin/ai/topup/packs", {
        data: PACK_PAYLOAD,
      });
      if (created.status() === 201) {
        pack = await body<PackRow>(created);
      } else if (created.status() === 409 || created.status() === 422) {
        // Another run created the fixed code between our list and create.
        pack = (await listPacks()).find((row) => row.code === PACK_CODE);
      } else {
        expect(created.status()).toBe(201);
      }
    }
    if (!pack) {
      throw new Error(`Top-up pack ${PACK_CODE} could not be created or found`);
    }
    if (!pack.active) {
      // The customer catalog is active-only; keep the shared test row usable.
      const patched = await api.patch(`/api/admin/ai/topup/packs/${pack.id}`, {
        data: { active: true },
      });
      expect(patched.status()).toBe(200);
      pack = await body<PackRow>(patched);
    }
    packId = pack.id;
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test("customer creates a manual order, uploads proof, and waits for verification", async ({
    page,
  }) => {
    test.skip(!!suiteSkipReason, suiteSkipReason);
    test.skip(!packId, "No top-up pack is available in this environment");

    await page.goto("/ai/topup");
    await expect(page.getByTestId("ai-topup-page")).toBeVisible({
      timeout: 20_000,
    });

    const packCard = page.getByTestId(`topup-pack-${requirePackId()}`);
    const featureOff = page.getByTestId("ai-topup-feature-off");
    const loadError = page.getByTestId("ai-topup-error");
    await expect(
      packCard
        .or(featureOff)
        .or(loadError)
        .or(page.getByTestId("ai-topup-empty")),
    ).toBeVisible({ timeout: 20_000 });

    // beforeAll already probed the flag; these states cover a flip between the
    // API probe and the browser session, and never fail for a disabled env.
    if (await featureOff.isVisible()) {
      test.skip(true, "AI_GATEWAY_ENABLED is off; AI top-up suite skipped.");
    }
    if (await loadError.isVisible()) {
      const copy = (await loadError.innerText()).toLowerCase();
      if (copy.includes("not enabled") || copy.includes("tidak diaktifkan")) {
        test.skip(true, "AI_GATEWAY_ENABLED is off; AI top-up suite skipped.");
      }
    }

    await packCard.click();
    await page.getByTestId("ai-topup-method-manual").click();

    const created = page.waitForResponse(
      (res) =>
        res.url().endsWith("/api/ai/topup/orders") &&
        res.request().method() === "POST",
    );
    await page.getByTestId("ai-topup-submit").click();
    const createdRes = await created;
    const createdBody = await createdRes.text();
    if (
      createdRes.status() === 503 &&
      /bank transfer is not configured/i.test(createdBody)
    ) {
      test.skip(
        true,
        "INVOICE_BANK_* not configured; manual transfer is unavailable.",
      );
    }
    expect(createdRes.status(), createdBody).toBe(201);

    await expect(page).toHaveURL(/\/ai\/topup\/[0-9a-f-]{36}$/);
    orderId = new URL(page.url()).pathname.split("/").pop();
    expect(orderId).toBeTruthy();

    await expect(page.getByTestId("ai-topup-bank")).toBeVisible();
    await expect(page.getByTestId("ai-topup-reference")).toBeVisible();

    await page
      .getByTestId("ai-topup-proof-input")
      .setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: PROOF_PNG });
    await page.getByTestId("ai-topup-proof-submit").click();
    await expect(page.getByTestId("ai-topup-awaiting")).toBeVisible({
      timeout: 20_000,
    });
  });

  test("?status=finish does not fake a paid order", async ({ page }) => {
    test.skip(!!suiteSkipReason, suiteSkipReason);
    test.skip(!orderId, "The happy-path test did not create an order");

    await page.goto(`/ai/topup/${requireOrderId()}?status=finish`);
    await expect(page.getByTestId("ai-topup-status-page")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("ai-topup-awaiting")).toBeVisible({
      timeout: 20_000,
    });
    // Server truth wins: the query string must not render the paid state.
    await expect(page.getByTestId("ai-topup-paid")).toHaveCount(0);
  });

  test("admin approves the transfer and the customer sees the paid state", async ({
    page,
  }) => {
    test.skip(!!suiteSkipReason, suiteSkipReason);
    test.skip(!orderId, "The happy-path test did not create an order");
    const id = requireOrderId();

    await page.goto("/admin/ai/topups");
    await expect(page.getByTestId("admin-ai-topups-page")).toBeVisible({
      timeout: 20_000,
    });
    // Default filter is awaiting_verification and the list is newest-first, so
    // the order created above is on the first page.
    await expect(page.getByTestId("admin-ai-topups-table")).toBeVisible({
      timeout: 20_000,
    });

    await page.getByTestId(`topup-actions-${id}`).click();
    await page.getByTestId(`topup-approve-${id}`).click();
    await page.getByTestId("admin-ai-topups-bank-ref").fill(`E2E-${runId}`);
    await page.getByTestId("admin-ai-topups-approve-submit").click();

    // Success surfaces as a toast, and the row leaves the awaiting queue.
    await expect(page.getByTestId(`admin-ai-topup-${id}`)).toHaveCount(0, {
      timeout: 20_000,
    });

    await page.goto(`/ai/topup/${id}`);
    // The status page polls every 3s; allow the round trip to settle.
    await expect(page.getByTestId("ai-topup-paid")).toBeVisible({
      timeout: 20_000,
    });
  });
});
