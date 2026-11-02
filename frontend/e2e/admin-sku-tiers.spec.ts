import { test, expect, type Page } from "./fixtures";

const runId = Date.now().toString(36);
const tierCode = `e2e_${runId}`;
const tierLabel = `E2E Pro+ ${runId}`;

async function apiStatus(
  page: Page,
  method: "POST" | "DELETE",
  path: string,
): Promise<number> {
  return page.evaluate(
    async ({ method: verb, path: target }) => {
      const token = window.localStorage.getItem("accessToken");
      const response = await fetch(target, {
        method: verb,
        headers: {
          Authorization: `Bearer ${token ?? ""}`,
          "X-E2E-Test": "true",
        },
      });
      return response.status;
    },
    { method, path },
  );
}

async function openTierTab(page: Page): Promise<void> {
  await page.goto("/admin/skus");
  await page.getByTestId("sku-tab-tiers").click();
  await expect(page.getByTestId("sku-tier-table")).toBeVisible();
}

test.describe.serial("Admin — SKU tiers @admin", () => {
  test.afterAll(async ({ page }) => {
    await apiStatus(
      page,
      "POST",
      `/api/admin/sku-tiers/${tierCode}/deactivate`,
    );
    await apiStatus(page, "POST", "/api/admin/sku-tiers/multi/reactivate");
  });

  test("opens the tier tab from the existing SKU page", async ({ page }) => {
    await openTierTab(page);
    await expect(page.getByTestId("sku-tier-row-basic")).toBeVisible();
    await expect(page.getByTestId("sku-tier-row-enterprise")).toBeVisible();
  });

  test("creates a tier with limits and prices", async ({ page }) => {
    await openTierTab(page);
    await page.getByTestId("sku-tier-create").click();
    await page.locator("#tier-code").fill(tierCode);
    await page.locator("#tier-label").fill(tierLabel);
    await page.locator("#tier-limit-scan").fill("5");
    await page.locator("#tier-limit-host").fill("5");
    await page.locator("#tier-limit-uptime").fill("100");
    await page.locator("#tier-limit-guard").fill("5");
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
