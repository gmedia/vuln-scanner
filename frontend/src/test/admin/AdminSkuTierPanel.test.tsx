import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";

import AdminSkuTierPanel from "@/pages/admin/AdminSkuTierPanel";
import {
  createSkuTier,
  deactivateSkuTier,
  deleteSkuTier,
  getAdminSkuTiers,
  reactivateSkuTier,
  updateSkuTier,
} from "@/api/admin";
import type { SkuTierInfo } from "@/api/subscription";
import { tierFixtures } from "@/test/fixtures/skuTiers";

vi.mock("@/api/admin", () => ({
  adminApi: {
    getSkuCatalog: vi.fn(async () => []),
  },
  getAdminSkuTiers: vi.fn(),
  createSkuTier: vi.fn(),
  updateSkuTier: vi.fn(),
  deactivateSkuTier: vi.fn(),
  reactivateSkuTier: vi.fn(),
  deleteSkuTier: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function withUsage(
  code: string,
  usage: SkuTierInfo["usage"],
): SkuTierInfo[] {
  return tierFixtures.map((tier) =>
    tier.code === code ? { ...tier, usage } : tier,
  );
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminSkuTierPanel />
    </QueryClientProvider>,
  );
}

async function openMenu(code: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByTestId(`sku-tier-actions-${code}`));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAdminSkuTiers).mockResolvedValue(tierFixtures);
  vi.mocked(createSkuTier).mockResolvedValue(tierFixtures[0]);
  vi.mocked(updateSkuTier).mockResolvedValue(tierFixtures[0]);
  vi.mocked(deactivateSkuTier).mockResolvedValue(tierFixtures[0]);
  vi.mocked(reactivateSkuTier).mockResolvedValue(tierFixtures[0]);
  vi.mocked(deleteSkuTier).mockResolvedValue();
});

describe("AdminSkuTierPanel", () => {
  it("renders tiers from the API with limits and usage", async () => {
    vi.mocked(getAdminSkuTiers).mockResolvedValue(
      withUsage("multi", {
        orgs: 2,
        subscriptions: 1,
        invoices: 3,
        requests: 0,
      }),
    );
    renderPanel();

    expect(await screen.findByTestId("sku-tier-table")).toBeInTheDocument();
    expect(screen.getByTestId("sku-tier-row-basic")).toHaveTextContent("Basic");
    expect(screen.getByTestId("sku-tier-row-multi")).toHaveTextContent(
      "10/10/200/10",
    );
    expect(screen.getByTestId("sku-tier-row-multi")).toHaveTextContent(
      "2/1/3/0",
    );
  });

  it("creates a tier with limits and prices", async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByTestId("sku-tier-table");
    await user.click(screen.getByTestId("sku-tier-create"));
    await user.type(screen.getByLabelText("Code"), "pro_plus");
    await user.type(screen.getByLabelText("Label"), "Pro+");
    await user.type(screen.getByLabelText("Scan list price"), "1800000");
    await user.type(screen.getByLabelText("Host list price"), "900000");
    await user.type(screen.getByLabelText("Uptime list price"), "300000");
    await user.type(screen.getByLabelText("Guard list price"), "400000");
    await user.click(screen.getByTestId("sku-tier-save"));

    await waitFor(() => expect(createSkuTier).toHaveBeenCalled());
    expect(createSkuTier).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "pro_plus",
        label: "Pro+",
        limit_scan: 1,
        limit_host: 1,
        limit_uptime: 10,
        limit_guard: 1,
        prices: {
          scan: { list_idr: 1_800_000, invoicable: true },
          host: { list_idr: 900_000, invoicable: true },
          uptime: { list_idr: 300_000, invoicable: true },
          guard: { list_idr: 400_000, invoicable: true },
        },
      }),
    );
  }, 15_000);

  it("deactivates a tier without a confirmation dialog", async () => {
    renderPanel();
    const user = await openMenu("multi");
    await user.click(await screen.findByTestId("sku-tier-deactivate-multi"));

    expect(deactivateSkuTier).toHaveBeenCalledWith("multi");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("confirms permanent deletion with the sibling dialog", async () => {
    renderPanel();
    const user = await openMenu("multi");
    await user.click(await screen.findByTestId("sku-tier-delete-multi"));

    expect(deleteSkuTier).not.toHaveBeenCalled();
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByTestId("sku-tier-delete-confirm"));
    await waitFor(() => expect(deleteSkuTier).toHaveBeenCalledWith("multi"));
  });

  it("disables permanent deletion for a tier that is still used", async () => {
    vi.mocked(getAdminSkuTiers).mockResolvedValue(
      withUsage("multi", {
        orgs: 4,
        subscriptions: 2,
        invoices: 1,
        requests: 0,
      }),
    );
    renderPanel();
    await openMenu("multi");
    const item = await screen.findByTestId("sku-tier-delete-multi");
    expect(item).toHaveAttribute("aria-disabled", "true");
  });

  it("surfaces a 409 detail from delete", async () => {
    vi.mocked(deleteSkuTier).mockRejectedValue({
      response: { data: { detail: "Tier is still in use" } },
    });
    renderPanel();
    const user = await openMenu("multi");
    await user.click(await screen.findByTestId("sku-tier-delete-multi"));
    await user.click(await screen.findByTestId("sku-tier-delete-confirm"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Tier is still in use"),
    );
  });

  it("hides price fields for a sales-led tier", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByTestId("sku-tier-table");
    await user.click(screen.getByTestId("sku-tier-create"));
    await user.click(screen.getByLabelText("Sales-led (quote only)"));

    expect(screen.queryByTestId("tier-prices")).toBeNull();
    await user.type(screen.getByLabelText("Code"), "quote_only");
    await user.type(screen.getByLabelText("Label"), "Quote only");
    await user.click(screen.getByTestId("sku-tier-save"));

    await waitFor(() => expect(createSkuTier).toHaveBeenCalled());
    expect(createSkuTier).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "quote_only",
        sales_led: true,
        requestable: false,
        allow_siem: true,
        billing_unrestricted: true,
        prices: undefined,
      }),
    );
  });

  it("requires all four prices for a self-serve tier", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByTestId("sku-tier-table");
    await user.click(screen.getByTestId("sku-tier-create"));
    await user.type(screen.getByLabelText("Code"), "starter");
    await user.type(screen.getByLabelText("Label"), "Starter");
    await user.click(screen.getByTestId("sku-tier-save"));

    expect(createSkuTier).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Fill all four prices for a self-serve tier",
    );
  });
});
