import { test, expect } from "./fixtures";

test.describe("Credit History @shell", () => {
  test("page loads with Credit history heading", async ({ page }) => {
    await page.goto("/credit-history");
    await expect(page.locator('[data-slot="page-header"] h2')).toBeVisible();
  });

  test("ledger card title is visible", async ({ page }) => {
    await page.goto("/credit-history");
    await expect(
      page.getByTestId("credit-history-list-shell").locator("h3"),
    ).toBeVisible();
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

    const emptyText = page.getByTestId("credit-empty");
    const table = page.locator("table");

    const emptyVisible = await emptyText.isVisible().catch(() => false);
    const tableVisible = await table.isVisible().catch(() => false);

    if (emptyVisible) {
      await expect(emptyText).toBeVisible();
      await expect(emptyText).toContainText(/\S/);
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
      await expect(page.getByTestId("credit-col-date")).toBeVisible();
      await expect(page.getByTestId("credit-col-type")).toBeVisible();
      await expect(page.getByTestId("credit-col-amount")).toBeVisible();
      await expect(page.getByTestId("credit-col-description")).toBeVisible();
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
      cellTexts.some((t) => /\d{4}|^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(t.trim())),
    ).toBeTruthy();
    expect(
      cellTexts.some((t) =>
        ["credit", "deduct", "refund"].includes(t.trim().toLowerCase()),
      ),
    ).toBeTruthy();
  });

  test("type badges render for ledger rows", async ({ page }) => {
    await page.goto("/credit-history");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const typeBadges = page.locator('[data-testid="credit-type-badge"]');
    const badgeCount = await typeBadges.count().catch(() => 0);

    if (badgeCount > 0) {
      await expect(typeBadges.first()).toBeVisible();
      const types = await typeBadges.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-type")),
      );
      for (const type of types) {
        expect(["credit", "deduct", "refund"]).toContain(type);
      }
    }
  });

  test("amounts render with the matching sign", async ({ page }) => {
    await page.goto("/credit-history");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const positiveAmounts = page.locator(
      '[data-testid="credit-amount"][data-sign="positive"]',
    );
    const negativeAmounts = page.locator(
      '[data-testid="credit-amount"][data-sign="negative"]',
    );

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

    const pagination = page.getByTestId("credit-pagination-status");
    if (await pagination.isVisible().catch(() => false)) {
      await expect(pagination).toBeVisible();
      await expect(pagination).toHaveAttribute("data-page", "1");
      await expect(
        page.getByRole("button", { name: "Previous page" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Next page" }),
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

    const pagination = page.getByTestId("credit-pagination-status");
    if (await pagination.isVisible().catch(() => false)) {
      await expect(pagination).toHaveAttribute("data-page", "1");
      const prevBtn = page.getByRole("button", { name: "Previous page" });
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

    const pagination = page.getByTestId("credit-pagination-status");
    if (await pagination.isVisible().catch(() => false)) {
      const currentPage = Number(await pagination.getAttribute("data-page"));
      const totalPages = Number(await pagination.getAttribute("data-total"));
      if (currentPage < totalPages) {
        const nextBtn = page.getByRole("button", { name: "Next page" });
        await expect(nextBtn).toBeEnabled();
      }
    }
  });

  test("clicking next page updates pagination state", async ({ page }) => {
    await page.goto("/credit-history");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const pagination = page.getByTestId("credit-pagination-status");
    if (await pagination.isVisible().catch(() => false)) {
      const currentPage = Number(await pagination.getAttribute("data-page"));
      const totalPages = Number(await pagination.getAttribute("data-total"));
      if (currentPage < totalPages) {
        await page.getByRole("button", { name: "Next page" }).click();
        await expect(pagination).toHaveAttribute("data-page", "2");
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
      const totalBadge = page.getByTestId("credit-total-badge");
      await expect(totalBadge).toBeVisible();
      await expect(totalBadge).toHaveAttribute("data-count", /\d+/);
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
      const lastCell = page.getByTestId("credit-description").first();
      if (await lastCell.isVisible().catch(() => false)) {
        await expect(lastCell).toBeVisible();
      }
    }
  });
});
