import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminSkuCatalog from "@/pages/admin/AdminSkuCatalog";
import { adminApi, type SkuCatalogItem, type SkuPricingResponse } from "@/api/admin";

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
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const catalog: SkuCatalogItem[] = [
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
];

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
    return { data: options.queryKey[0] === "admin-sku-pricing" ? pricing : catalog } as never;
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
