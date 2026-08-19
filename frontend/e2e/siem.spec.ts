import { test, expect } from "./fixtures";

function isPublicProdBase(): boolean {
  const raw = process.env.BASE_URL || "";
  try {
    const host = new URL(raw).hostname;
    return (
      host === "sinexis.app" ||
      host.endsWith(".sinexis.app") ||
      host === "vs.appmedia.id" ||
      host.endsWith(".vs.appmedia.id")
    );
  } catch {
    return false;
  }
}

async function openSiem(
  page: Parameters<Parameters<typeof test>[1]>[0]["page"],
) {
  await page.goto("/siem");
  await expect(
    page.getByRole("heading", { name: "SIEM", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Pencarian event terkontrol + kasus", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Gagal memuat status SIEM")).toHaveCount(0);
}

test.describe("SIEM — Layer A smoke", () => {
  test("page loads heading without crashing", async ({ page }) => {
    await openSiem(page);
  });

  test("sidebar links to SIEM", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByTestId("nav-siem").click();
    await expect(page).toHaveURL(/\/siem$/);
    await expect(
      page.getByRole("heading", { name: "SIEM", exact: true }),
    ).toBeVisible();
  });

  test("enabled host shows search or empty-agent card; off shows feature card", async ({
    page,
  }) => {
    await openSiem(page);
    const off = page.getByTestId("siem-feature-off");
    const search = page.getByTestId("siem-search");
    const noAgents = page.getByTestId("siem-no-agents");
    await expect(off.or(search).or(noAgents).first()).toBeVisible({
      timeout: 20_000,
    });
    if (await off.isVisible()) {
      await expect(search).toHaveCount(0);
      return;
    }
    await expect(search).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Kasus", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Terapkan", exact: true }),
    ).toBeVisible();
  });

  test("search submit does not 5xx the page when feature is on", async ({
    page,
  }) => {
    await openSiem(page);
    if (await page.getByTestId("siem-feature-off").isVisible()) {
      test.info().annotations.push({
        type: "note",
        description: "SIEM flag off — skip search click",
      });
      return;
    }
    await page.getByRole("button", { name: "Terapkan", exact: true }).click();
    await expect(page.getByText("Gagal memuat status SIEM")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(
      "Internal Server Error",
    );
    await expect(
      page
        .getByTestId("siem-events-empty")
        .or(page.getByTestId("siem-event-row").first()),
    ).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("SIEM — Layer B mutations (CI / non-prod)", () => {
  test.beforeEach(() => {
    test.skip(
      isPublicProdBase(),
      "Layer B skipped on public production (no case create/patch)",
    );
  });

  test("create case from a selected event when events exist", async ({
    page,
  }) => {
    await openSiem(page);
    if (await page.getByTestId("siem-feature-off").isVisible()) {
      test.info().annotations.push({
        type: "note",
        description: "SIEM flag off — skip case create",
      });
      return;
    }
    await page.getByRole("button", { name: "Terapkan", exact: true }).click();
    const empty = page.getByTestId("siem-events-empty");
    const firstDataRow = page.getByTestId("siem-event-row");
    await expect(empty.or(firstDataRow.first())).toBeVisible({
      timeout: 20_000,
    });
    if (await empty.isVisible()) {
      test.info().annotations.push({
        type: "note",
        description: "no Indexer events — skip create",
      });
      return;
    }
    await firstDataRow.first().click();
    const detail = page.getByTestId("siem-event-detail");
    await expect(detail).toBeVisible();
    const title = `e2e-siem-${Date.now()}`;
    await page.locator("#siem-case-title").fill(title);
    await page.getByRole("button", { name: "Buat kasus" }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });
  });
});
