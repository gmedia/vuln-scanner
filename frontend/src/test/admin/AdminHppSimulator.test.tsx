import { describe, it, expect, beforeAll, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminHppSimulator from "@/pages/admin/AdminHppSimulator";

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("@/api/admin", () => ({
  adminApi: {
    getSkuCatalog: vi.fn(),
  },
}));

import { useQuery } from "@tanstack/react-query";
import { adminApi, type SkuCatalogItem } from "@/api/admin";

const catalog: SkuCatalogItem[] = [
  {
    product: "scan",
    sku: "basic",
    list_idr: 300000,
    seats: 1,
    invoicable: true,
    updated_at: "",
  },
  {
    product: "scan",
    sku: "pro",
    list_idr: 650000,
    seats: 3,
    invoicable: true,
    updated_at: "",
  },
];

vi.mocked(adminApi.getSkuCatalog).mockResolvedValue(catalog);
vi.mocked(useQuery).mockReturnValue({ data: catalog } as never);

describe("AdminHppSimulator", () => {
  it("renders the scenario banner and one row per service", () => {
    render(<AdminHppSimulator />);
    expect(screen.getByTestId("hpp-sim-banner")).toBeInTheDocument();
    expect(screen.getByTestId("hpp-sim-row-scan")).toBeInTheDocument();
    expect(screen.getByTestId("hpp-sim-row-host")).toBeInTheDocument();
    expect(screen.getByTestId("hpp-sim-row-uptime")).toBeInTheDocument();
    expect(screen.getByTestId("hpp-sim-row-guard")).toBeInTheDocument();
  });

  it("shows no percentage before the operator types a cost", () => {
    render(<AdminHppSimulator />);
    const table = screen.getByTestId("hpp-sim-table");
    expect(table.textContent ?? "").not.toMatch(/\d+%/);
    expect(screen.queryByText(/\(\d+%\)/)).toBeNull();
  });

  it("computes scan HPP, margin, and margin percent from typed assumptions", async () => {
    const user = userEvent.setup();
    render(<AdminHppSimulator />);
    await user.type(screen.getByTestId("hpp-sim-fixed-cost"), "100000");
    await user.type(screen.getByTestId("hpp-sim-volume-scan"), "10");
    await user.type(screen.getByTestId("hpp-sim-unitcost-scan"), "50000");
    fireEvent.change(screen.getByTestId("hpp-sim-price-scan"), {
      target: { value: "100000" },
    });

    const row = screen.getByTestId("hpp-sim-row-scan");
    expect(row).toHaveTextContent("500.000");
    expect(row).toHaveTextContent("400.000");
    expect(row).toHaveTextContent("40%");
  });

  it("keeps an uncosted uptime row honest", () => {
    render(<AdminHppSimulator />);
    const row = screen.getByTestId("hpp-sim-row-uptime");
    expect(row).toHaveTextContent("cost not filled in");
    expect(row.textContent ?? "").not.toMatch(/\d+%/);
  });

  it("lists a formatted target price once a target margin is entered", async () => {
    const user = userEvent.setup();
    render(<AdminHppSimulator />);
    await user.type(screen.getByTestId("hpp-sim-fixed-cost"), "100000");
    await user.type(screen.getByTestId("hpp-sim-volume-scan"), "10");
    await user.type(screen.getByTestId("hpp-sim-unitcost-scan"), "50000");
    fireEvent.change(screen.getByTestId("hpp-sim-price-scan"), {
      target: { value: "100000" },
    });
    await user.type(screen.getByTestId("hpp-sim-target-margin"), "30");

    const line = screen.getByTestId("hpp-sim-target-price");
    expect(line).toHaveTextContent("Target price @ target margin");
    expect(line).toHaveTextContent("Scan");
    expect(line.textContent ?? "").toMatch(/\d{1,3}(\.\d{3})+/);
  });

  it("prefills the scan price from the catalog when Pro is picked", async () => {
    const user = userEvent.setup();
    render(<AdminHppSimulator />);
    fireEvent.change(screen.getByTestId("hpp-sim-price-scan"), {
      target: { value: "" },
    });
    await user.click(screen.getByTestId("hpp-sim-sku-scan"));
    await user.click(await screen.findByRole("option", { name: "Pro" }));
    expect(screen.getByTestId("hpp-sim-price-scan")).toHaveValue("650000");
  });

  it("does not invent a price when the selected SKU is missing from the catalog", () => {
    const sparse: SkuCatalogItem[] = catalog.filter(
      (row) => !(row.product === "host" && row.sku === "basic"),
    );
    vi.mocked(useQuery).mockReturnValue({ data: sparse } as never);
    render(<AdminHppSimulator />);
    expect(screen.getByTestId("hpp-sim-price-host")).toHaveValue("");
    expect(screen.getByTestId("hpp-sim-price-warning")).toBeInTheDocument();
    expect(screen.getByTestId("hpp-sim-price-warning").textContent ?? "").not.toMatch(
      /\d+%/,
    );
  });
});
