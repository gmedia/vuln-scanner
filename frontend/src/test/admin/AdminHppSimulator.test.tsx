import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
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
    getHppReport: vi.fn(),
  },
}));

import { useQuery } from "@tanstack/react-query";
import { adminApi, type HppReportResponse, type SkuPriceItem } from "@/api/admin";

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

const report: HppReportResponse = {
  from_date: "2026-10-01",
  to_date: "2026-10-14",
  lines: [
    { key: "ip", count: 10, rate_idr: 50_000, hpp_idr: 500_000, overhead_share_idr: 0, fully_loaded_hpp_idr: 500_000, fully_loaded_unit_idr: 50_000 },
    { key: "domain", count: 0, rate_idr: 0, hpp_idr: 0, overhead_share_idr: 0, fully_loaded_hpp_idr: 0, fully_loaded_unit_idr: 0 },
    { key: "apk", count: 0, rate_idr: 0, hpp_idr: 0, overhead_share_idr: 0, fully_loaded_hpp_idr: 0, fully_loaded_unit_idr: 0 },
    { key: "ipa", count: 0, rate_idr: 0, hpp_idr: 0, overhead_share_idr: 0, fully_loaded_hpp_idr: 0, fully_loaded_unit_idr: 0 },
    { key: "statushost", count: 0, rate_idr: 0, hpp_idr: 0, overhead_share_idr: 0, fully_loaded_hpp_idr: 0, fully_loaded_unit_idr: 0 },
    { key: "hostscan", count: 4, rate_idr: 25_000, hpp_idr: 100_000, overhead_share_idr: 0, fully_loaded_hpp_idr: 100_000, fully_loaded_unit_idr: 25_000 },
    { key: "uptimecheck", count: 200, rate_idr: 5, hpp_idr: 1_000, overhead_share_idr: 0, fully_loaded_hpp_idr: 1_000, fully_loaded_unit_idr: 5 },
    { key: "guardagent", count: 2, rate_idr: 1_000, hpp_idr: 2_000, overhead_share_idr: 0, fully_loaded_hpp_idr: 2_000, fully_loaded_unit_idr: 1_000 },
  ],
  total_count: 216,
  total_hpp_idr: 603_000,
  overhead_idr: 100_000,
  journal_opex_idr: 0,
  journal_variable_idr: 0,
  total_fully_loaded_hpp_idr: 703_000,
  unallocated_overhead_idr: 0,
  line_margins: [],
};

let currentPrices: SkuPriceItem[];
let currentReport: HppReportResponse;

beforeEach(() => {
  currentPrices = prices;
  currentReport = report;
  vi.mocked(adminApi.getSkuPrices).mockResolvedValue(prices);
  vi.mocked(adminApi.getHppReport).mockResolvedValue(report);
  vi.mocked(useQuery).mockImplementation((options) => ({
    data: options.queryKey[0] === "admin-hpp-report" ? currentReport : currentPrices,
  }) as never);
});

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
    currentReport = { ...report, lines: [] };
    render(<AdminHppSimulator />);
    const table = screen.getByTestId("hpp-sim-table");
    expect(table.textContent ?? "").not.toMatch(/\d+%/);
    expect(screen.queryByText(/\(\d+%\)/)).toBeNull();
  });

  it("prefills unit cost from the HPP report", () => {
    render(<AdminHppSimulator />);
    expect((screen.getByTestId("hpp-sim-unitcost-scan") as HTMLInputElement).value).toBe("50000");
    expect((screen.getByTestId("hpp-sim-unitcost-host") as HTMLInputElement).value).toBe("25000");
    expect((screen.getByTestId("hpp-sim-unitcost-uptime") as HTMLInputElement).value).toBe("5");
    expect((screen.getByTestId("hpp-sim-unitcost-guard") as HTMLInputElement).value).toBe("1000");
    expect(screen.getByTestId("hpp-sim-cost-source")).toBeInTheDocument();
  });

  it("weights scan job costs without report overhead", () => {
    currentReport = {
      ...report,
      lines: report.lines.map((line) => {
        if (line.key === "ip") {
          return { ...line, overhead_share_idr: 100_000, fully_loaded_hpp_idr: 600_000, fully_loaded_unit_idr: 60_000 };
        }
        if (line.key === "domain") {
          return { ...line, count: 10, rate_idr: 10_000, hpp_idr: 100_000, fully_loaded_hpp_idr: 100_000, fully_loaded_unit_idr: 10_000 };
        }
        return line;
      }),
    };
    render(<AdminHppSimulator />);
    expect((screen.getByTestId("hpp-sim-unitcost-scan") as HTMLInputElement).value).toBe("30000");
  });

  it("operator override wins over the HPP prefill", () => {
    render(<AdminHppSimulator />);
    const input = screen.getByTestId("hpp-sim-unitcost-scan") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "999" } });
    expect(input.value).toBe("999");
  });

  it("no HPP cost → no prefill and the zero-cost guard holds", () => {
    currentReport = { ...report, lines: [] };
    render(<AdminHppSimulator />);
    expect((screen.getByTestId("hpp-sim-unitcost-scan") as HTMLInputElement).value).toBe("");
    expect(screen.queryByTestId("hpp-sim-cost-source")).toBeNull();
    const row = screen.getByTestId("hpp-sim-row-scan");
    expect(row).toHaveTextContent("cost not filled in");
    expect(row.textContent ?? "").not.toMatch(/\d+%/);
  });

  it("computes scan HPP, margin, and margin percent from typed assumptions", async () => {
    const user = userEvent.setup();
    currentReport = { ...report, lines: [] };
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
    currentReport = { ...report, lines: report.lines.filter((line) => line.key !== "uptimecheck") };
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
    fireEvent.change(screen.getByTestId("hpp-sim-unitcost-scan"), {
      target: { value: "50000" },
    });
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
    currentPrices = sparse;
    render(<AdminHppSimulator />);
    expect(screen.getByTestId("hpp-sim-price-host")).toHaveValue("");
    expect(screen.getByTestId("hpp-sim-price-warning")).toBeInTheDocument();
    expect(screen.getByTestId("hpp-sim-price-warning").textContent ?? "").not.toMatch(
      /\d+%/,
    );
  });
});
