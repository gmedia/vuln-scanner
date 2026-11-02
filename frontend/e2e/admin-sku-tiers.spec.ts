import { test, expect, type Page } from "./fixtures";

const runId = Date.now().toString(36);
const tierCode = `e2e_${runId}`;
const tierLabel = `E2E Pro+ ${runId}`;
const baseURL = process.env.BASE_URL || "http://localhost";

// Captured in the first test so `afterAll` can clean up without a page fixture
// (`context`/`page` are test-scoped and unavailable in `afterAll`).
let accessToken: string | null = null;

async function adminStatus(
  method: "POST" | "DELETE",
  path: string,
): Promise<number> {
  if (!accessToken) return 0;
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-E2E-Test": "true",
    },
  });
  return response.status;
}

async function openTierTab(page: Page): Promise<void> {
  await page.goto("/admin/skus");
  await page.getByTestId("sku-tab-tiers").click();
  await expect(page.getByTestId("sku-tier-table")).toBeVisible();
}

test.describe.serial("Admin — SKU tiers @admin", () => {
  test.afterAll(async () => {
    await adminStatus("POST", `/api/admin/sku-tiers/${tierCode}/deactivate`);
    await adminStatus("POST", "/api/admin/sku-tiers/multi/reactivate");
  });

  test("opens the tier tab from the existing SKU page", async ({ page }) => {
    await openTierTab(page);
    accessToken = await page.evaluate(() =>
      window.localStorage.getItem("accessToken"),
    );
    await expect(page.getByTestId("sku-tier-row-basic")).toBeVisible();
    await expect(page.getByTestId("sku-tier-row-enterprise")).toBeVisible();
  });

  test("creates a tier with limits and prices", async ({ page }) => {
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

  test("the new tier appears on the subscription page", async ({ page }) => {
    await page.goto("/settings/subscription");
    await expect(page.getByTestId("subscription-page")).toBeVisible();
    await expect(page.getByTestId(`subscription-plan-${tierCode}`)).toBeVisible();
  });

  test("deactivating a tier removes it from new choices", async ({ page }) => {
    await openTierTab(page);
    await page.getByTestId("sku-tier-actions-multi").click();
    await page.getByTestId("sku-tier-deactivate-multi").click();
    await expect(page.getByTestId("sku-tier-row-multi")).toContainText(
      /Pensiun|Retired/,
    );

    await page.goto("/settings/subscription");
    await expect(page.getByTestId("subscription-page")).toBeVisible();
    const choice = page.getByTestId("subscription-choose-multi");
    if ((await choice.count()) > 0) {
      await expect(choice).toBeDisabled();
    }
  });

  test("deletes the unused tier and blocks deleting a used tier", async ({
    page,
  }) => {
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
