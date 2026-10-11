import { type Page } from "@playwright/test";
import { test, expect } from "./fixtures";

type Point = { readonly x: number; readonly y: number };

async function dragLeft(page: Page, from: Point, to: Point): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  await page.mouse.move(midX, midY, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

test.describe("Mobile interactions @smoke", () => {
  test("bottom nav is visible on a phone viewport and routes", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("bottom-nav")).toBeVisible();
    await expect(page.getByTestId("bottom-nav-dashboard")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByTestId("bottom-nav-scan")).toBeVisible();
    await expect(page.getByTestId("bottom-nav-assets")).toBeVisible();

    await page.getByTestId("bottom-nav-assets").click();
    await expect(page).toHaveURL(/\/assets$/);
  });

  test("swiping the open drawer left closes it", async ({ page }) => {
    await page.goto("/dashboard");
    const drawer = page.locator('[data-mobile="true"]');
    await page.locator('[data-sidebar="trigger"]').click();
    await expect(drawer).toBeVisible();

    const box = await drawer.boundingBox();
    expect(box, "drawer has a layout box").not.toBeNull();
    const y = box!.y + box!.height / 2;
    await dragLeft(
      page,
      { x: box!.x + box!.width - 40, y },
      { x: box!.x + 10, y },
    );

    await expect(drawer).toBeHidden();
  });

  test("a wide filter bar opens in a bottom sheet", async ({ page }) => {
    await page.goto("/credit-history");
    const toggle = page.getByTestId("credit-filters-toggle");
    await expect(toggle).toBeVisible();

    await toggle.click();
    const sheet = page.getByTestId("credit-history-filters-sheet");
    await expect(sheet).toBeVisible();

    await page.getByTestId("credit-history-filters-sheet-done").click();
    await expect(sheet).toBeHidden();
  });

  test("an asset card reveals its delete action on swipe", async ({ page }) => {
    await page.goto("/assets");
    const card = page.locator('[data-testid^="asset-card-"]').first();
    const hasCard = await card
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasCard, "No assets seeded for the E2E organization");

    const box = await card.boundingBox();
    expect(box, "asset card has a layout box").not.toBeNull();
    const y = box!.y + 20;
    await dragLeft(
      page,
      { x: box!.x + box!.width - 20, y },
      { x: box!.x + 5, y },
    );

    const transform = await card.evaluate(
      (el) => getComputedStyle(el.parentElement as HTMLElement).transform,
    );
    expect(transform).toMatch(/matrix\(1, 0, 0, 1, -/);
  });
});
