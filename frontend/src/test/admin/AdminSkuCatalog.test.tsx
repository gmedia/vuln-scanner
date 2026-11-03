import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminSkuCatalog from "@/pages/admin/AdminSkuCatalog";
import { adminApi, type SkuCatalogItem, type SkuPricingResponse } from "@/api/admin";
import { tierFixtures } from "@/test/fixtures/skuTiers";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock("@/api/admin", () => ({
  adminApi: {
    getSkuCatalog: vi.fn(),
    getSkuPricing: vi.fn(),
    updateSkuCatalog: vi.fn(),
    getAdminSkuTiers: vi.fn(async () => []),
    createSkuTier: vi.fn(),
    updateSkuTier: vi.fn(),
    deactivateSkuTier: vi.fn(),
    reactivateSkuTier: vi.fn(),
    deleteSkuTier: vi.fn(),
  },
  getAdminSkuTiers: vi.fn(async () => tierFixtures),
  getSkuTierHistory: vi.fn(async () => ({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
  })),
  getOrgTierHistory: vi.fn(async () => ({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
  })),
  createSkuTier: vi.fn(),
  updateSkuTier: vi.fn(),
  deactivateSkuTier: vi.fn(),
  reactivateSkuTier: vi.fn(),
  deleteSkuTier: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const catalog: SkuCatalogItem[] = ([
  {
    product: "scan",
    sku: "basic",
    list_idr: 300000,
    seats: 1,
    invoicable: true,
    updated_at: "2026-09-13T00:00:00Z",
  },
  {
    product: "scan",
    sku: "pro",
    list_idr: 650000,
    seats: 3,
    invoicable: true,
    updated_at: "2026-09-13T00:00:00Z",
    updated_by: "11111111-1111-1111-1111-111111111111",
    updated_by_email: "ops@sinexis.app",
  },
  {
    product: "scan",
    sku: "multi",
    list_idr: 2000000,
    seats: 10,
    invoicable: true,
    updated_at: "2026-09-13T00:00:00Z",
  },
  {
    product: "host",
    sku: "basic",
    list_idr: 150000,
    seats: 1,
    invoicable: true,
    updated_at: "2026-09-13T00:00:00Z",
  },
  {
    product: "host",
    sku: "pro",
    list_idr: 350000,
    seats: 3,
    invoicable: true,
    updated_at: "2026-09-13T00:00:00Z",
  },
  {
    product: "host",
    sku: "multi",
    list_idr: 900000,
    seats: 10,
    invoicable: true,
    updated_at: "2026-09-13T00:00:00Z",
  },
  { product: "uptime", sku: "basic", list_idr: 75000, seats: 10, invoicable: true, updated_at: "" },
  { product: "guard", sku: "basic", list_idr: 100000, seats: 1, invoicable: true, updated_at: "" },
] as Omit<SkuCatalogItem, "label" | "active">[]).map((row) => ({
  ...row,
  label: row.sku.charAt(0).toUpperCase() + row.sku.slice(1),
  active: true,
}));

const pricing: SkuPricingResponse = {
  items: [
    { service: "scan", sku: "basic", list_idr: 300000, invoicable: true },
    { service: "scan", sku: "pro", list_idr: 650000, invoicable: true },
    { service: "scan", sku: "multi", list_idr: 2000000, invoicable: true },
    { service: "host", sku: "basic", list_idr: 150000, invoicable: true },
    { service: "host", sku: "pro", list_idr: 350000, invoicable: true },
    { service: "host", sku: "multi", list_idr: 900000, invoicable: true },
    { service: "uptime", sku: "basic", list_idr: 75000, invoicable: true },
    { service: "guard", sku: "basic", list_idr: 100000, invoicable: true },
  ],
  bundles: [
    { tier: "basic", bundle_idr: 450000, alacarte_idr: 625000, saving_idr: 175000, saving_pct: 28.0 },
    { tier: "pro", bundle_idr: 1000000, alacarte_idr: 1450000, saving_idr: 450000, saving_pct: 31.0 },
    { tier: "multi", bundle_idr: 2900000, alacarte_idr: 4000000, saving_idr: 1100000, saving_pct: 27.5 },
  ],
  annual: { months_paid: 10, months_served: 12 },
};

const mutate = vi.fn();

beforeEach(() => {
  mutate.mockReset();
  vi.mocked(adminApi.getSkuCatalog).mockResolvedValue(catalog);
  vi.mocked(adminApi.getSkuPricing).mockResolvedValue(pricing);
  vi.mocked(adminApi.updateSkuCatalog).mockResolvedValue(catalog[0]);
  vi.mocked(useQuery).mockImplementation((options) => {
    if (options.queryKey[0] === "admin-sku-tiers") {
      return { data: tierFixtures } as never;
    }
    return {
      data: options.queryKey[0] === "admin-sku-pricing" ? pricing : catalog,
    } as never;
  });
  vi.mocked(useQueryClient).mockReturnValue({
    invalidateQueries: vi.fn(),
  } as never);
  vi.mocked(useMutation).mockImplementation((options) => {
    return {
      mutate: (vars: unknown) => {
        mutate(vars);
        const fn = (
          options as { mutationFn?: (v: unknown) => Promise<unknown> }
        ).mutationFn;
        void fn?.(vars);
      },
      isPending: false,
    } as never;
  });
});

describe("AdminSkuCatalog", () => {
  it("renders the pricing and tier tabs without a second page", async () => {
    const user = userEvent.setup();
    render(<AdminSkuCatalog />);
    expect(screen.getByRole("tab", { name: "Pricing" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Tiers & features" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Tiers & features" }));
    expect(await screen.findByTestId("sku-tier-table")).toBeInTheDocument();
    expect(screen.getByTestId("sku-tier-row-basic")).toHaveTextContent(
      "Basic",
    );
  });

  it("labels catalog rows from the API and flags retired tiers", () => {
    const retired = catalog.map((row) =>
      row.sku === "multi" ? { ...row, active: false } : row,
    );
    vi.mocked(useQuery).mockImplementation(((options: { queryKey: unknown[] }) => {
      if (options.queryKey[0] === "admin-sku-tiers") {
        return { data: tierFixtures } as never;
      }
      return {
        data:
          options.queryKey[0] === "admin-sku-pricing" ? pricing : retired,
      } as never;
    }) as typeof useQuery);
    render(<AdminSkuCatalog />);
    expect(screen.getByTestId("sku-catalog-row-scan-pro")).toHaveTextContent(
      "Pro",
    );
    expect(
      screen.getByTestId("sku-catalog-retired-scan-multi"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("sku-catalog-row-scan-pro")).toHaveTextContent(
      "3",
    );
  });

  it("opens the tier history from a price row", async () => {
    vi.mocked(useQuery).mockImplementation(((options: { queryKey: unknown[] }) => {
      if (options.queryKey[0] === "sku-tier-history") {
        return {
          data: {
            items: [
              {
                id: "h1",
                sku_code: "pro",
                action: "price_updated",
                actor_email: "ops@sinexis.app",
                changes: {
                  "price.scan.list_idr": { from: 600_000, to: 650_000 },
                },
                created_at: "2026-11-03T00:00:00Z",
              },
            ],
            total: 1,
            page: 1,
            page_size: 20,
          },
        } as never;
      }
      if (options.queryKey[0] === "admin-sku-tiers") {
        return { data: tierFixtures } as never;
      }
      return {
        data:
          options.queryKey[0] === "admin-sku-pricing" ? pricing : catalog,
      } as never;
    }) as typeof useQuery);
    const user = userEvent.setup();
    render(<AdminSkuCatalog />);

    await user.click(
      screen.getByTestId("sku-catalog-history-scan-pro"),
    );

    expect(
      await screen.findByTestId("sku-tier-history-dialog"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("sku-tier-history-entry")).toHaveTextContent(
      "price.scan.list_idr",
    );
    expect(screen.getByTestId("sku-tier-history-entry")).toHaveTextContent(
      "ops@sinexis.app",
    );
  });

  it("renders a collapsible usage guide", async () => {
    const user = userEvent.setup();
    render(<AdminSkuCatalog />);
    expect(screen.getByTestId("sku-catalog-guide")).toBeInTheDocument();
    expect(
      screen.queryByText("Edit the list price for a row — this is the selling price, not the cost."),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Steps" }));
    expect(
      await screen.findByText("Edit the list price for a row — this is the selling price, not the cost."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Limits" }));
    expect(
      await screen.findByText("Seats follow the tier cap and cannot be edited here. Open the tier to change them."),
    ).toBeInTheDocument();
  });

  it("shows the locked bundle and annual reference", () => {
    render(<AdminSkuCatalog />);
    expect(screen.getByTestId("sku-bundle-card")).toBeInTheDocument();
    expect(screen.getByTestId("sku-bundle-row-basic")).toHaveTextContent("450.000");
    expect(screen.getByTestId("sku-bundle-row-basic")).toHaveTextContent("625.000");
    expect(screen.getByTestId("sku-bundle-row-multi")).toHaveTextContent("2.900.000");
    expect(screen.getByTestId("sku-annual-note")).toHaveTextContent("pay 10 months, serve 12");
    expect(within(screen.getByTestId("sku-bundle-card")).queryByRole("textbox")).toBeNull();
  });

  it("renders eight catalog rows and the lock warning", () => {
    render(<AdminSkuCatalog />);
    expect(screen.getAllByTestId(/^sku-catalog-row-/)).toHaveLength(8);
    expect(screen.getByTestId("sku-catalog-row-scan-basic")).toBeInTheDocument();
    expect(screen.getByTestId("sku-catalog-row-scan-pro")).toBeInTheDocument();
    expect(screen.getByTestId("sku-catalog-row-scan-multi")).toBeInTheDocument();
    expect(screen.getByTestId("sku-catalog-row-host-basic")).toBeInTheDocument();
    expect(screen.getByTestId("sku-catalog-row-host-pro")).toBeInTheDocument();
    expect(screen.getByTestId("sku-catalog-row-host-multi")).toBeInTheDocument();
    expect(
      screen.getByText(/does not change past invoices/i),
    ).toBeInTheDocument();
  });

  it("labels uptime and guard products", () => {
    render(<AdminSkuCatalog />);
    expect(screen.getByTestId("sku-catalog-row-uptime-basic")).toHaveTextContent("Uptime");
    expect(screen.getByTestId("sku-catalog-row-guard-basic")).toHaveTextContent("Guard");
  });

  it("shows who last updated a catalog row", () => {
    render(<AdminSkuCatalog />);
    expect(screen.getByTestId("sku-catalog-actor-scan-pro")).toHaveTextContent("by ops@sinexis.app");
    expect(screen.queryByTestId("sku-catalog-actor-scan-basic")).toBeNull();
  });

  it("keeps seats read-only", () => {
    render(<AdminSkuCatalog />);
    expect(
      document.querySelector("[data-testid*='seats']"),
    ).toBeNull();
    expect(screen.getByTestId("sku-catalog-row-scan-basic")).toHaveTextContent(
      "1",
    );
    expect(screen.getByTestId("sku-catalog-row-scan-pro")).toHaveTextContent(
      "3",
    );
    expect(screen.getByTestId("sku-catalog-row-host-multi")).toHaveTextContent(
      "10",
    );
  });

  it("confirms a price change before writing the catalog", async () => {
    const user = userEvent.setup();
    render(<AdminSkuCatalog />);
    fireEvent.change(screen.getByTestId("sku-catalog-price-scan-basic"), {
      target: { value: "400000" },
    });
    await user.click(screen.getByTestId("sku-catalog-save-scan-basic"));
    expect(screen.getByText(/300\.000/)).toBeInTheDocument();
    expect(screen.getByText(/400\.000/)).toBeInTheDocument();
    expect(adminApi.updateSkuCatalog).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Yes, save" }));
    expect(adminApi.updateSkuCatalog).toHaveBeenCalledWith("scan", "basic", {
      list_idr: 400000,
      invoicable: true,
    });
  });

  it("passes invoicable false when the checkbox is cleared", async () => {
    const user = userEvent.setup();
    render(<AdminSkuCatalog />);
    await user.click(screen.getByTestId("sku-catalog-invoicable-host-pro"));
    await user.click(screen.getByTestId("sku-catalog-save-host-pro"));
    await user.click(screen.getByRole("button", { name: "Yes, save" }));
    expect(adminApi.updateSkuCatalog).toHaveBeenCalledWith("host", "pro", {
      list_idr: 350000,
      invoicable: false,
    });
  });

  it("disables save when nothing changed", () => {
    render(<AdminSkuCatalog />);
    expect(screen.getByTestId("sku-catalog-save-scan-basic")).toBeDisabled();
  });
});
