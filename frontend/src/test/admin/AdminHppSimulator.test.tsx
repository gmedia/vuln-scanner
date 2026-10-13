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
    getSkuPrices: vi.fn(),
  },
}));

import { useQuery } from "@tanstack/react-query";
import { adminApi, type SkuPriceItem } from "@/api/admin";

const prices: SkuPriceItem[] = [
  { service: "scan", sku: "basic", list_idr: 300000, invoicable: true },
  { service: "scan", sku: "pro", list_idr: 650000, invoicable: true },
  { service: "scan", sku: "multi", list_idr: 2000000, invoicable: true },
  { service: "host", sku: "basic", list_idr: 150000, invoicable: true },
  { service: "host", sku: "pro", list_idr: 350000, invoicable: true },
  { service: "host", sku: "multi", list_idr: 900000, invoicable: true },
  { service: "uptime", sku: "basic", list_idr: 75000, invoicable: false },
  { service: "uptime", sku: "pro", list_idr: 200000, invoicable: false },
  { service: "uptime", sku: "multi", list_idr: 500000, invoicable: false },
  { service: "guard", sku: "basic", list_idr: 100000, invoicable: false },
  { service: "guard", sku: "pro", list_idr: 250000, invoicable: false },
  { service: "guard", sku: "multi", list_idr: 600000, invoicable: false },
];

vi.mocked(adminApi.getSkuPrices).mockResolvedValue(prices);
vi.mocked(useQuery).mockReturnValue({ data: prices } as never);

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

  it("prefills a locked price for uptime and guard", async () => {
    const user = userEvent.setup();
    render(<AdminHppSimulator />);
    const uptimePrice = screen.getByTestId("hpp-sim-price-uptime") as HTMLInputElement;
    const guardPrice = screen.getByTestId("hpp-sim-price-guard") as HTMLInputElement;
    expect(screen.getByTestId("hpp-sim-sku-uptime")).toBeInTheDocument();
    expect(uptimePrice.value).toBe("75000");
    expect(guardPrice.value).toBe("100000");

    await user.click(screen.getByTestId("hpp-sim-sku-uptime"));
    await user.click(await screen.findByRole("option", { name: "Multi" }));
    expect(uptimePrice.value).toBe("500000");
  });

  it("still shows scan/host catalog prices", async () => {
    const user = userEvent.setup();
    render(<AdminHppSimulator />);
    expect(screen.getByTestId("hpp-sim-price-scan")).toHaveValue("300000");
    expect(screen.getByTestId("hpp-sim-price-host")).toHaveValue("150000");

    await user.click(screen.getByTestId("hpp-sim-sku-scan"));
    await user.click(await screen.findByRole("option", { name: "Pro" }));
    expect(screen.getByTestId("hpp-sim-price-scan")).toHaveValue("650000");
  });

  it("renders a collapsible usage guide", async () => {
    const user = userEvent.setup();
    render(<AdminHppSimulator />);
    expect(screen.getByTestId("hpp-sim-guide")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Enter the monthly fixed cost (overhead + journal) — one lump sum for all services.",
      ),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Steps" }));
    expect(
      await screen.findByText(
        "Enter the monthly fixed cost (overhead + journal) — one lump sum for all services.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Limits" }));
    expect(
      await screen.findByText(
        "Nothing is saved — refreshing or leaving the page clears your inputs.",
      ),
    ).toBeInTheDocument();
  });

  it("does not invent a price when the selected SKU is missing from the catalog", () => {
    const sparse: SkuPriceItem[] = prices.filter(
      (row) => !(row.service === "host" && row.sku === "basic"),
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
