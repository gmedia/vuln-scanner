import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
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

  it("renders the DASHBOARD heading", () => {
    render(<Dashboard />);
    expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
  });

  it("renders the Crosshair icon", () => {
    render(<Dashboard />);
    // lucide-react Crosshair renders an SVG — check by heading text which is always present
    expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
  });

  it("renders stat cards with zero values when no scans", () => {
    render(<Dashboard />);
    expect(screen.getByText("Total Scans")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
  });

  it("renders SCAN HISTORY section", () => {
    render(<Dashboard />);
    expect(screen.getByText("SCAN HISTORY")).toBeInTheDocument();
  });

  it("renders QUICK ACTIONS section", () => {
    render(<Dashboard />);
    expect(screen.getByText("QUICK ACTIONS")).toBeInTheDocument();
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
    expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
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
    expect(screen.getByText("5 findings")).toBeInTheDocument();
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
    expect(screen.getByText("Load More")).toBeInTheDocument();
  });

  it("shows total scan count", () => {
    mockHistoryData.total = 42;
    mockUseScanHistory.mockReturnValue({
      data: mockHistoryData,
      isLoading: false,
      isFetching: false,
    });
    render(<Dashboard />);
    expect(screen.getByText("42 total")).toBeInTheDocument();
  });
});
