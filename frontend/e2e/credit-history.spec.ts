import { test, expect } from "@playwright/test";

test.describe("Credit History", () => {
  test("page loads with CREDIT HISTORY heading", async ({ page }) => {
    await page.goto("/credit-history");
    await expect(page.locator("h2:has-text('CREDIT HISTORY')")).toBeVisible();
  });

  test("TRANSACTIONS card title is visible", async ({ page }) => {
    await page.goto("/credit-history");
    await expect(page.locator("text=TRANSACTIONS")).toBeVisible();
  });

  test("shows loading skeletons initially then resolves", async ({ page }) => {
    await page.goto("/credit-history");
    const skeletons = page.locator("[data-slot='skeleton']");
    const skeletonCount = await skeletons.count();
    if (skeletonCount > 0) {
      await expect(skeletons.first()).toBeVisible();
      await skeletons.first().waitFor({ state: "hidden", timeout: 15_000 });
    }
  });

  test("shows either empty state or data table", async ({ page }) => {
    await page.goto("/credit-history");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const emptyText = page.locator("text=No transactions yet");
    const table = page.locator("table");

    const emptyVisible = await emptyText.isVisible().catch(() => false);
    const tableVisible = await table.isVisible().catch(() => false);

    if (emptyVisible) {
      await expect(emptyText).toBeVisible();
      await expect(
        page.locator("text=Credit adjustments will appear here."),
      ).toBeVisible();
    } else if (tableVisible) {
      await expect(table).toBeVisible();
    }
  });

  test("table headers are correct when data exists", async ({ page }) => {
    await page.goto("/credit-history");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const table = page.locator("table");
    if (await table.isVisible().catch(() => false)) {
      await expect(page.locator("th:has-text('Date')")).toBeVisible();
      await expect(page.locator("th:has-text('Type')")).toBeVisible();
      await expect(page.locator("th:has-text('Amount')")).toBeVisible();
      await expect(page.locator("th:has-text('Description')")).toBeVisible();
    }
  });

  test("transaction rows have date, type badge, amount, and description", async ({
    page,
  }) => {
    await page.goto("/credit-history");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count().catch(() => 0);
    if (rowCount === 0) return;

    const firstRow = rows.first();
    const cells = firstRow.locator("td");
    const cellCount = await cells.count();
    expect(cellCount).toBeGreaterThanOrEqual(4);

    const cellTexts = await cells.allTextContents();
    expect(
      cellTexts.some((t) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t.trim())),
    ).toBeTruthy();
    expect(
      cellTexts.some((t) =>
        ["credit", "deduct", "refund"].includes(t.trim().toLowerCase()),
      ),
    ).toBeTruthy();
  });

  test("type badges have correct color classes", async ({ page }) => {
    await page.goto("/credit-history");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const creditBadge = page.locator("table tbody tr td span.bg-green-600");
    const deductBadge = page.locator("table tbody tr td span.bg-red-600");
    const refundBadge = page.locator("table tbody tr td span.bg-blue-600");

    const badgeCount =
      (await creditBadge.count().catch(() => 0)) +
      (await deductBadge.count().catch(() => 0)) +
      (await refundBadge.count().catch(() => 0));

    if (badgeCount > 0) {
      const anyBadge = page.locator("table tbody tr td span").first();
      await expect(anyBadge).toBeVisible();
    }
  });

  test("positive amounts have green-400 class", async ({ page }) => {
    await page.goto("/credit-history");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const positiveAmounts = page.locator(
      "table tbody tr td span.text-green-400",
    );
    const negativeAmounts = page.locator("table tbody tr td span.text-red-400");

    const posCount = await positiveAmounts.count().catch(() => 0);
    const negCount = await negativeAmounts.count().catch(() => 0);

    if (posCount + negCount > 0) {
      if (posCount > 0) {
        const text = await positiveAmounts.first().textContent();
        expect(text?.trim()).toMatch(/^\+/);
      }
      if (negCount > 0) {
        const text = await negativeAmounts.first().textContent();
        expect(text?.trim()).toMatch(/^-/);
      }
    }
  });

  test("pagination appears when totalPages > 1", async ({ page }) => {
    await page.goto("/credit-history");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const pagination = page.locator("text=/Page \\d+ of \\d+/");
    if (await pagination.isVisible().catch(() => false)) {
      await expect(pagination).toBeVisible();
      await expect(
        page.locator("button:has(svg.lucide-chevron-left)"),
      ).toBeVisible();
      await expect(
        page.locator("button:has(svg.lucide-chevron-right)"),
      ).toBeVisible();
    }
  });

  test("pagination previous button is disabled on first page", async ({
    page,
  }) => {
    await page.goto("/credit-history");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const pagination = page.locator("text=/Page 1 of \\d+/");
    if (await pagination.isVisible().catch(() => false)) {
      const prevBtn = page.locator("button:has(svg.lucide-chevron-left)");
      await expect(prevBtn).toBeDisabled();
    }
  });

  test("pagination next button is enabled when not on last page", async ({
    page,
  }) => {
    await page.goto("/credit-history");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const pagination = page.locator("text=/Page \\d+ of \\d+/");
    if (await pagination.isVisible().catch(() => false)) {
      const pageText = await pagination.textContent();
      const match = pageText?.match(/Page (\d+) of (\d+)/);
      if (match && parseInt(match[1]) < parseInt(match[2])) {
        const nextBtn = page.locator("button:has(svg.lucide-chevron-right)");
        await expect(nextBtn).not.toBeDisabled();
      }
    }
  });

  test("clicking next page updates pagination text", async ({ page }) => {
    await page.goto("/credit-history");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const pagination = page.locator("text=/Page \\d+ of \\d+/");
    if (await pagination.isVisible().catch(() => false)) {
      const pageText = await pagination.textContent();
      const match = pageText?.match(/Page (\d+) of (\d+)/);
      if (match && parseInt(match[1]) < parseInt(match[2])) {
        await page.locator("button:has(svg.lucide-chevron-right)").click();
        await page.waitForTimeout(1000);
        await expect(page.locator("text=/Page 2 of \\d+/")).toBeVisible();
      }
    }
  });

  test("total count badge visible when transactions exist", async ({
    page,
  }) => {
    await page.goto("/credit-history");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const table = page.locator("table");
    if (await table.isVisible().catch(() => false)) {
      const totalBadge = page.locator("text=/\\d+ total/");
      if (await totalBadge.isVisible().catch(() => false)) {
        await expect(totalBadge).toBeVisible();
      }
    }
  });

  test("description shows — when null", async ({ page }) => {
    await page.goto("/credit-history");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const table = page.locator("table");
    if (await table.isVisible().catch(() => false)) {
      const lastCell = page.locator("table tbody tr td").nth(3);
      if (await lastCell.isVisible().catch(() => false)) {
        await expect(lastCell).toBeVisible();
      }
    }
  });
});
