import type { APIRequestContext, Page } from "@playwright/test";

import { e2eEmail, e2ePassword } from "./credentials";
import { test, expect } from "./fixtures";

const runId = Date.now().toString(36);
const tierCode = `e2e_${runId}`;
const tierLabel = `E2E Pro+ ${runId}`;
const retireCode = `e2e_ret_${runId}`;
const retireLabel = `E2E Retire ${runId}`;
const baseURL = process.env.BASE_URL || "http://localhost";

const createdCodes = [tierCode, retireCode];

function tierBody(code: string, label: string) {
  return {
    code,
    label,
    limit_scan: 5,
    limit_host: 5,
    limit_uptime: 100,
    limit_guard: 5,
    prices: {
      scan: { list_idr: 1_800_000, invoicable: true },
      host: { list_idr: 900_000, invoicable: true },
      uptime: { list_idr: 300_000, invoicable: true },
      guard: { list_idr: 400_000, invoicable: true },
    },
  };
}

async function openTierTab(page: Page): Promise<void> {
  await page.goto("/admin/skus");
  await page.getByTestId("sku-tab-tiers").click();
  await expect(page.getByTestId("sku-tier-table")).toBeVisible();
}

test.describe.serial("Admin — SKU tiers @admin", () => {
  let api: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { "X-E2E-Test": "true" },
    });
    const login = await anonymous.post("/api/auth/login", {
      data: { email: e2eEmail(), password: e2ePassword() },
    });
    expect(login.status()).toBe(200);
    const { access_token: token } = (await login.json()) as {
      access_token?: string;
    };
    await anonymous.dispose();

    api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: {
        "X-E2E-Test": "true",
        Authorization: `Bearer ${token ?? ""}`,
      },
    });
  });

  test.afterAll(async () => {
    if (!api) return;
    for (const code of createdCodes) {
      await api.delete(`/api/admin/sku-tiers/${code}`);
    }
    await api.dispose();
  });

  test("opens the tier tab from the existing SKU page", async ({ page }) => {
    await openTierTab(page);
    await expect(page.getByTestId("sku-tier-row-basic")).toBeVisible();
    await expect(page.getByTestId("sku-tier-row-enterprise")).toBeVisible();
  });

  test("creates a tier with limits and prices", async ({ page }) => {
    await api.delete(`/api/admin/sku-tiers/${tierCode}`);
    await openTierTab(page);
    await page.getByTestId("sku-tier-create").click();
    await page.locator("#tier-code").fill(tierCode);
    await page.locator("#tier-label").fill(tierLabel);
    await page.locator("#tier-limit_scan").fill("5");
    await page.locator("#tier-limit_host").fill("5");
    await page.locator("#tier-limit_uptime").fill("100");
    await page.locator("#tier-limit_guard").fill("5");
    await page.locator("#tier-price-scan").fill("1800000");
    await page.locator("#tier-price-host").fill("900000");
    await page.locator("#tier-price-uptime").fill("300000");
    await page.locator("#tier-price-guard").fill("400000");
    await page.getByTestId("sku-tier-save").click();

    await expect(page.getByTestId(`sku-tier-row-${tierCode}`)).toBeVisible();
    await expect(page.getByTestId(`sku-tier-row-${tierCode}`)).toContainText(
      tierLabel,
    );
  });

  test("the tier history shows the creation entry", async ({ page }) => {
    await openTierTab(page);
    await page.getByTestId(`sku-tier-actions-${tierCode}`).click();
    await page.getByTestId(`sku-tier-history-${tierCode}`).click();

    await expect(page.getByTestId("sku-tier-history-dialog")).toBeVisible();
    const entries = page.getByTestId("sku-tier-history-entry");
    await expect(entries.first()).toBeVisible();
    await expect(entries.first()).toContainText(/Dibuat|Created/);
    await expect(entries.first()).toContainText("price.scan.list_idr");
  });

  test("the new tier appears on the subscription page", async ({ page }) => {
    await page.goto("/settings/subscription");
    await expect(page.getByTestId("subscription-page")).toBeVisible();
    await expect(page.getByTestId(`subscription-plan-${tierCode}`)).toBeVisible();
  });

  test("retiring a tier removes it from new choices", async ({ page }) => {
    await api.delete(`/api/admin/sku-tiers/${retireCode}`);
    const created = await api.post("/api/admin/sku-tiers", {
      data: tierBody(retireCode, retireLabel),
    });
    expect(created.status()).toBe(201);

    await page.goto("/settings/subscription");
    await expect(page.getByTestId(`subscription-plan-${retireCode}`)).toBeVisible();

    await openTierTab(page);
    await page.getByTestId(`sku-tier-actions-${retireCode}`).click();
    await page.getByTestId(`sku-tier-deactivate-${retireCode}`).click();
    await expect(page.getByTestId(`sku-tier-row-${retireCode}`)).toContainText(
      /Pensiun|Retired/,
    );

    await page.goto("/settings/subscription");
    await expect(page.getByTestId("subscription-page")).toBeVisible();
    await expect(page.getByTestId(`subscription-plan-${retireCode}`)).toHaveCount(0);
  });

  test("deletes the unused tier and blocks deleting a used tier", async ({
    page,
  }) => {
    const listed = await api.get("/api/admin/sku-tiers");
    const tiers = (await listed.json()) as { code: string }[];
    if (!tiers.some((tier) => tier.code === tierCode)) {
      const recreated = await api.post("/api/admin/sku-tiers", {
        data: tierBody(tierCode, tierLabel),
      });
      expect(recreated.status()).toBe(201);
    }

    await openTierTab(page);

    await page.getByTestId("sku-tier-actions-basic").click();
    await expect(page.getByTestId("sku-tier-delete-basic")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await page.keyboard.press("Escape");

    await page.getByTestId(`sku-tier-actions-${tierCode}`).click();
    await page.getByTestId(`sku-tier-delete-${tierCode}`).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByTestId("sku-tier-delete-confirm").click();
    await expect(page.getByTestId(`sku-tier-row-${tierCode}`)).toHaveCount(0);
  });
});
