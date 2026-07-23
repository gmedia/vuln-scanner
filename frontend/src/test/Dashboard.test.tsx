import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dashboard from "@/pages/Dashboard";

let mockUseScanHistory: ReturnType<typeof vi.fn>;

const mockHistoryData = {
  items: [] as Array<{
    id: string;
    target: string;
    scan_type: string;
    status: string;
    started_at: string | null;
    result_summary: {
      total_findings: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
      info: number;
    } | null;
  }>,
  total: 0,
  page: 1,
  page_size: 20,
};

vi.mock("@/hooks/useScan", () => ({
  useScanHistory: vi.fn(() => ({
    data: mockHistoryData,
    isLoading: false,
    isFetching: false,
  })),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useNavigate: vi.fn(() => vi.fn()),
}));

describe("Dashboard", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/hooks/useScan");
    mockUseScanHistory = mod.useScanHistory as ReturnType<typeof vi.fn>;
    mockHistoryData.items = [];
    mockHistoryData.total = 0;
    mockHistoryData.page = 1;
    mockUseScanHistory.mockReturnValue({
      data: mockHistoryData,
      isLoading: false,
      isFetching: false,
    });
  });

  it("renders the Dashboard heading", () => {
    render(<Dashboard />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders primary New scan CTA", () => {
    render(<Dashboard />);
    expect(screen.getByTestId("new-scan-cta")).toHaveTextContent("New scan");
  });

  it("opens New scan menu with scan type links", async () => {
    render(<Dashboard />);
    await userEvent.click(screen.getByTestId("new-scan-cta"));
    expect(screen.getByRole("menuitem", { name: /IP scan/i })).toHaveAttribute("href", "/scan/ip");
    expect(screen.getByRole("menuitem", { name: /Domain scan/i })).toHaveAttribute("href", "/scan/domain");
    expect(screen.getByRole("menuitem", { name: /Mobile scan/i })).toHaveAttribute("href", "/scan/mobile");
  });

  it("renders findings-by-severity KPI labels", () => {
    render(<Dashboard />);
    expect(screen.getByText("Findings by severity")).toBeInTheDocument();
    expect(screen.getByText("Total scans")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Low + Info")).toBeInTheDocument();
  });

  it("renders Scan history section", () => {
    render(<Dashboard />);
    expect(screen.getByText("Scan history")).toBeInTheDocument();
  });

  it("renders Quick actions section", () => {
    render(<Dashboard />);
    expect(screen.getByText("Quick actions")).toBeInTheDocument();
  });

  it("renders quick action links", () => {
    render(<Dashboard />);
    expect(screen.getByText("New IP Scan")).toBeInTheDocument();
    expect(screen.getByText("New Domain Scan")).toBeInTheDocument();
    expect(screen.getByText("Upload APK/IPA")).toBeInTheDocument();
  });

  it("shows No scans yet when scan list is empty", () => {
    render(<Dashboard />);
    expect(screen.getByText("No scans yet")).toBeInTheDocument();
  });

  it("shows loading skeletons when first loading", () => {
    mockUseScanHistory.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: false,
    });
    render(<Dashboard />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders scan items when history has data", () => {
    mockHistoryData.items = [
      {
        id: "scan-1",
        target: "example.com",
        scan_type: "domain",
        status: "completed",
        started_at: "2026-01-01T00:00:00Z",
        result_summary: {
          total_findings: 5,
          critical: 1,
          high: 2,
          medium: 1,
          low: 1,
          info: 0,
        },
      },
    ];
    mockHistoryData.total = 1;
    mockUseScanHistory.mockReturnValue({
      data: mockHistoryData,
      isLoading: false,
      isFetching: false,
    });
    render(<Dashboard />);
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText(/5 findings/)).toBeInTheDocument();
  });

  it("displays correct scan type label for IP scans", () => {
    mockHistoryData.items = [
      {
        id: "scan-2",
        target: "192.168.1.1",
        scan_type: "ip",
        status: "completed",
        started_at: null,
        result_summary: null,
      },
    ];
    mockHistoryData.total = 1;
    mockUseScanHistory.mockReturnValue({
      data: mockHistoryData,
      isLoading: false,
      isFetching: false,
    });
    render(<Dashboard />);
    expect(screen.getByText("192.168.1.1")).toBeInTheDocument();
    expect(screen.getByText("IP Address")).toBeInTheDocument();
  });

  it("shows load more button when more pages available", () => {
    mockHistoryData.items = [
      {
        id: "scan-3",
        target: "test.com",
        scan_type: "domain",
        status: "completed",
        started_at: null,
        result_summary: null,
      },
    ];
    mockHistoryData.total = 25;
    mockUseScanHistory.mockReturnValue({
      data: mockHistoryData,
      isLoading: false,
      isFetching: false,
    });
    render(<Dashboard />);
    expect(screen.getByText("Load more")).toBeInTheDocument();
  });

  it("shows total scan count in history header", () => {
    mockHistoryData.total = 42;
    mockUseScanHistory.mockReturnValue({
      data: mockHistoryData,
      isLoading: false,
      isFetching: false,
    });
    render(<Dashboard />);
    expect(screen.getByText(/42 scan/)).toBeInTheDocument();
  });

  it("does not show NaN when result_summary is error-only (auto-failed)", () => {
    mockHistoryData.items = [
      {
        id: "scan-failed-1",
        target: "stg3.example.com",
        scan_type: "domain",
        status: "failed",
        started_at: null,
        result_summary: {
          error: "auto-failed: stuck pending > 30 minutes",
        } as unknown as (typeof mockHistoryData.items)[0]["result_summary"],
      },
      {
        id: "scan-ok-1",
        target: "ok.example.com",
        scan_type: "domain",
        status: "completed",
        started_at: "2026-01-01T00:00:00Z",
        result_summary: {
          total_findings: 3,
          critical: 1,
          high: 0,
          medium: 2,
          low: 0,
          info: 0,
        },
      },
    ];
    mockHistoryData.total = 2;
    mockUseScanHistory.mockReturnValue({
      data: mockHistoryData,
      isLoading: false,
      isFetching: false,
    });
    render(<Dashboard />);
    expect(screen.queryByText("NaN")).not.toBeInTheDocument();
    expect(screen.getByText("Critical").previousElementSibling?.textContent).toBe("1");
    expect(screen.getByText("High").previousElementSibling?.textContent).toBe("0");
    expect(screen.getByText("Medium").previousElementSibling?.textContent).toBe("2");
    expect(screen.queryByText("undefined findings")).not.toBeInTheDocument();
  });
});
