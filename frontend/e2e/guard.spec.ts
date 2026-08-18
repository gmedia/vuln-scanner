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
  await expect(page.getByTestId("guard-state")).toBeVisible({
    timeout: 20_000,
  });
}

test.describe("Guard — Layer A smoke", () => {
  test("page loads status card without crashing", async ({ page }) => {
    await openGuard(page);
    await expect(page.getByTestId("guard-state")).toContainText(
      /aktif|nonaktif/,
    );
  });

  test("sidebar links to Guard", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByTestId("nav-guard").click();
    await expect(page).toHaveURL(/\/guard$/);
    await expect(
      page.getByRole("heading", { name: "Guard", exact: true }),
    ).toBeVisible();
  });

  test("enabled org shows agent and alert sections or disabled empty card", async ({
    page,
  }) => {
    await openGuard(page);
    const enabled =
      (await page.getByTestId("guard-state").getAttribute("data-enabled")) ===
      "true";
    if (enabled) {
      await expect(page.getByTestId("guard-agents")).toBeVisible();
      await expect(page.getByTestId("guard-alerts")).toBeVisible();
    } else {
      await expect(page.getByTestId("guard-disabled")).toBeVisible();
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
    const alreadyOn =
      (await page.getByTestId("guard-state").getAttribute("data-enabled")) ===
      "true";
    if (alreadyOn) {
      test.info().annotations.push({
        type: "note",
        description: "already enabled — skip enable click",
      });
      return;
    }
    const enableBtn = page.getByRole("button", { name: "Aktifkan Guard" });
    await expect(enableBtn).toBeVisible();
    await enableBtn.click();
    await expect(page.getByTestId("guard-state")).toHaveAttribute(
      "data-enabled",
      "true",
      { timeout: 20_000 },
    );
  });

  test("generate enroll token shows once-only banner without asserting secret", async ({
    page,
  }) => {
    await openGuard(page);
    const tokenOn =
      (await page.getByTestId("guard-state").getAttribute("data-enabled")) ===
      "true";
    if (!tokenOn) {
      const enableBtn = page.getByRole("button", { name: "Aktifkan Guard" });
      if (await enableBtn.isVisible()) {
        await enableBtn.click();
        await expect(page.getByTestId("guard-state")).toHaveAttribute(
          "data-enabled",
          "true",
          { timeout: 20_000 },
        );
      }
    }

    await expect(page.getByText("Enroll token")).toBeVisible();
    await page.locator("#enroll-label").fill("e2e-ci");
    await page.getByRole("button", { name: "Buat token" }).click();

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
    const revokeOn =
      (await page.getByTestId("guard-state").getAttribute("data-enabled")) ===
      "true";
    if (!revokeOn) {
      const enableBtn = page.getByRole("button", { name: "Aktifkan Guard" });
      if (await enableBtn.isVisible()) {
        await enableBtn.click();
        await expect(page.getByTestId("guard-state")).toHaveAttribute(
          "data-enabled",
          "true",
          { timeout: 20_000 },
        );
      }
    }

    await expect(page.getByText("Enroll token")).toBeVisible();
    const label = `e2e-revoke-${Date.now()}`;
    await page.locator("#enroll-label").fill(label);
    await page.getByRole("button", { name: "Buat token" }).click();
    await expect(page.getByTestId("guard-host-enroll-steps")).toBeVisible({
      timeout: 20_000,
    });

    const row = page
      .getByTestId("guard-enroll-token-row")
      .filter({ hasText: label });
    await expect(row).toBeVisible();
    page.once("dialog", (d) => {
      void d.accept();
    });
    await row.getByRole("button", { name: "Cabut" }).click();
    await expect(row).toContainText("dicabut", { timeout: 20_000 });
    await expect(row.getByRole("button", { name: "Cabut" })).toHaveCount(0);
  });

  test("sync does not 5xx the page", async ({ page }) => {
    await openGuard(page);
    const syncOn =
      (await page.getByTestId("guard-state").getAttribute("data-enabled")) ===
      "true";
    if (!syncOn) {
      const enableBtn = page.getByRole("button", { name: "Aktifkan Guard" });
      if (await enableBtn.isVisible()) {
        await enableBtn.click();
        await expect(page.getByTestId("guard-state")).toHaveAttribute(
          "data-enabled",
          "true",
          { timeout: 20_000 },
        );
      }
    }

    const syncBtn = page.getByRole("button", { name: "Sinkronkan" });
    await expect(syncBtn).toBeVisible();
    await syncBtn.click();
    await expect(syncBtn).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByText("Gagal memuat status Guard")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(
      "Internal Server Error",
    );
  });
});
