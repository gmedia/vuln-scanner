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

async function openGuard(
  page: Parameters<Parameters<typeof test>[1]>[0]["page"],
) {
  await page.goto("/guard");
  await expect(
    page.getByRole("heading", { name: "Guard", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Inventori agen host + alert kritis", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Status", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Gagal memuat status Guard")).toHaveCount(0);
  await expect(page.locator("text=State:")).toBeVisible({ timeout: 20_000 });
}

test.describe("Guard — Layer A smoke", () => {
  test("page loads status card without crashing", async ({ page }) => {
    await openGuard(page);
    await expect(page.locator("text=State:")).toContainText(/enabled|disabled/);
  });

  test("sidebar links to Guard", async ({ page }) => {
    await page.goto("/dashboard");
    await page.locator("aside").locator("a:has-text('Guard')").click();
    await expect(page).toHaveURL(/\/guard$/);
    await expect(
      page.getByRole("heading", { name: "Guard", exact: true }),
    ).toBeVisible();
  });

  test("enabled org shows agent and alert sections or disabled empty card", async ({
    page,
  }) => {
    await openGuard(page);
    const enabled = await page.locator("text=State:").textContent();
    if (enabled?.includes("enabled")) {
      await expect(page.getByText("Agen", { exact: true })).toBeVisible();
      await expect(page.getByText("Alert kritis")).toBeVisible();
    } else {
      await expect(
        page.getByText("Aktifkan Guard (admin/owner)", { exact: false }),
      ).toBeVisible();
    }
  });
});

test.describe("Guard — Layer B mutations (CI / non-prod)", () => {
  test.beforeEach(() => {
    test.skip(
      isPublicProdBase(),
      "Layer B skipped on public production (no enable/token/sync)",
    );
  });

  test("admin can enable Guard when disabled", async ({ page }) => {
    await openGuard(page);
    const state = await page.locator("text=State:").textContent();
    if (state?.includes("enabled")) {
      test.info().annotations.push({
        type: "note",
        description: "already enabled — skip enable click",
      });
      return;
    }
    const enableBtn = page.getByRole("button", { name: "Aktifkan Guard" });
    await expect(enableBtn).toBeVisible();
    await enableBtn.click();
    await expect(page.locator("text=State:")).toContainText("enabled", {
      timeout: 20_000,
    });
  });

  test("generate enroll token shows once-only banner without asserting secret", async ({
    page,
  }) => {
    await openGuard(page);
    const state = await page.locator("text=State:").textContent();
    if (!state?.includes("enabled")) {
      const enableBtn = page.getByRole("button", { name: "Aktifkan Guard" });
      if (await enableBtn.isVisible()) {
        await enableBtn.click();
        await expect(page.locator("text=State:")).toContainText("enabled", {
          timeout: 20_000,
        });
      }
    }

    await expect(page.getByText("Enroll token")).toBeVisible();
    await page.locator("#enroll-label").fill("e2e-ci");
    await page.getByRole("button", { name: "Generate" }).click();

    const banner = page.getByTestId("guard-host-enroll-steps");
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(
      banner.getByText("Simpan sekarang", { exact: false }),
    ).toBeVisible();
    await expect(banner.locator("code").first()).toBeVisible();
    const secretLen = await banner
      .locator("code")
      .first()
      .evaluate((el) => {
        return (el.textContent || "").trim().length;
      });
    expect(secretLen).toBeGreaterThan(8);
  });

  test("revoke enroll token marks row revoked", async ({ page }) => {
    await openGuard(page);
    const state = await page.locator("text=State:").textContent();
    if (!state?.includes("enabled")) {
      const enableBtn = page.getByRole("button", { name: "Aktifkan Guard" });
      if (await enableBtn.isVisible()) {
        await enableBtn.click();
        await expect(page.locator("text=State:")).toContainText("enabled", {
          timeout: 20_000,
        });
      }
    }

    await expect(page.getByText("Enroll token")).toBeVisible();
    const label = `e2e-revoke-${Date.now()}`;
    await page.locator("#enroll-label").fill(label);
    await page.getByRole("button", { name: "Generate" }).click();
    await expect(page.getByTestId("guard-host-enroll-steps")).toBeVisible({
      timeout: 20_000,
    });

    const row = page
      .getByTestId("guard-enroll-token-row")
      .filter({ hasText: label });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Revoke" }).click();
    await expect(row).toContainText("revoked", { timeout: 20_000 });
    await expect(row.getByRole("button", { name: "Revoke" })).toHaveCount(0);
  });

  test("sync does not 5xx the page", async ({ page }) => {
    await openGuard(page);
    const state = await page.locator("text=State:").textContent();
    if (!state?.includes("enabled")) {
      const enableBtn = page.getByRole("button", { name: "Aktifkan Guard" });
      if (await enableBtn.isVisible()) {
        await enableBtn.click();
        await expect(page.locator("text=State:")).toContainText("enabled", {
          timeout: 20_000,
        });
      }
    }

    const syncBtn = page.getByRole("button", { name: "Sync" });
    await expect(syncBtn).toBeVisible();
    await syncBtn.click();
    await expect(syncBtn).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByText("Gagal memuat status Guard")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(
      "Internal Server Error",
    );
  });
});
