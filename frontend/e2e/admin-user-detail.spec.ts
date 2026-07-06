import { test, expect } from "@playwright/test";

async function goToFirstUserDetail(page: import("@playwright/test").Page) {
  await page.goto("/admin/users");
  await page
    .waitForSelector("[data-slot='skeleton']", {
      state: "hidden",
      timeout: 15_000,
    })
    .catch(() => {});

  const viewBtn = page.locator("button:has-text('View')").first();
  await viewBtn.click({ force: true });
  await page.waitForURL(/\/admin\/users\/[a-f0-9-]+/, { timeout: 15_000 });
}

test.describe("Admin — User Detail", () => {
  test("page loads with USER DETAILS heading", async ({ page }) => {
    await goToFirstUserDetail(page);
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    await expect(page.locator("h2:has-text('USER DETAILS')")).toBeVisible();
  });

  test("Back button navigates to user list", async ({ page }) => {
    await goToFirstUserDetail(page);
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    await page.locator("button:has-text('Back')").click();
    await page.waitForURL("/admin/users", { timeout: 15_000 });
    await expect(page.locator("h2:has-text('USER MANAGEMENT')")).toBeVisible();
  });

  test("PROFILE card title is visible", async ({ page }) => {
    await goToFirstUserDetail(page);
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    await expect(page.locator("text=PROFILE")).toBeVisible();
  });

  test("displays user email", async ({ page }) => {
    await goToFirstUserDetail(page);
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    // .last() — the detail page email renders after the header user button
    await expect(page.locator("text=e2e@vulnscan.dev").last()).toBeVisible();
  });

  test("admin badge shows Admin", async ({ page }) => {
    await goToFirstUserDetail(page);
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    await expect(page.locator("text=Admin").first()).toBeVisible();
  });

  test("verified badge is visible", async ({ page }) => {
    await goToFirstUserDetail(page);
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const verifiedBadge = page.locator("text=/Verified|Unverified/");
    await expect(verifiedBadge.first()).toBeVisible();
  });

  test("credits count is visible", async ({ page }) => {
    await goToFirstUserDetail(page);
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    await expect(page.locator("text=/\\d+ credits/")).toBeVisible();
  });

  test("joined date is visible", async ({ page }) => {
    await goToFirstUserDetail(page);
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    await expect(page.locator("text=/Joined \\d/")).toBeVisible();
  });

  test("scan count is visible", async ({ page }) => {
    await goToFirstUserDetail(page);
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    await expect(page.locator("text=/\\d+ scans performed/")).toBeVisible();
  });

  test("CREDIT ADJUSTMENT card is visible", async ({ page }) => {
    await goToFirstUserDetail(page);
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    await expect(page.locator("text=CREDIT ADJUSTMENT")).toBeVisible();
  });

  test("ADJUST CREDITS button is disabled when amount is empty", async ({
    page,
  }) => {
    await goToFirstUserDetail(page);
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const adjustBtn = page.locator("button:has-text('ADJUST CREDITS')");
    await expect(adjustBtn).toBeDisabled();
  });

  test("filling amount enables the ADJUST CREDITS button", async ({ page }) => {
    await goToFirstUserDetail(page);
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const amountInput = page.locator("label:has-text('AMOUNT') + input");
    await amountInput.fill("10");

    const adjustBtn = page.locator("button:has-text('ADJUST CREDITS')");
    await expect(adjustBtn).not.toBeDisabled();
  });

  test("submitting credit adjustment shows feedback", async ({ page }) => {
    await goToFirstUserDetail(page);
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const amountInput = page.locator("label:has-text('AMOUNT') + input");
    await amountInput.fill("5");

    const descriptionInput = page.locator(
      "label:has-text('DESCRIPTION') + input",
    );
    await descriptionInput.fill("e2e test credit");

    await page.locator("button:has-text('ADJUST CREDITS')").click();

    const feedback = page.locator(
      "text=/Credits updated successfully|Failed to update credits/",
    );
    await expect(feedback).toBeVisible({ timeout: 15_000 });
  });
});
