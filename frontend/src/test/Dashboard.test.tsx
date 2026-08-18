import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dashboard from "@/pages/Dashboard";
import { useAuthStore } from "@/store/authStore";

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

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useQuery: vi.fn(({ queryKey }: { queryKey: unknown[] }) => {
      const key = String(queryKey[0]);
      if (key === "schedules") return { data: [] };
      if (key === "guard-agents") return { data: [] };
      if (key === "guard-alerts") return { data: [] };
      return { data: undefined };
    }),
  };
});

vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useNavigate: vi.fn(() => vi.fn()),
}));

vi.mock("@/store/creditStore", () => ({
  useCreditStore: (sel: (s: { credits: number; fetchBalance: () => Promise<void> }) => unknown) =>
    sel({ credits: 6996, fetchBalance: vi.fn(async () => {}) }),
}));

describe("Dashboard", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    useAuthStore.setState({
      activeOrgId: "org-a",
      organizations: [
        {
          id: "org-a",
          name: "Org A",
          slug: "org-a",
          role: "owner",
          kind: "team",
        },
        {
          id: "org-b",
          name: "Org B",
          slug: "org-b",
          role: "owner",
          kind: "team",
        },
      ],
      user: {
        id: "u1",
        email: "u@example.com",
        is_verified: true,
        is_admin: false,
        credits: 10,
      },
      isAuthenticated: true,
    });
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

  it("renders the Ringkasan heading", () => {
    render(<Dashboard />);
    expect(screen.getByText("Ringkasan")).toBeInTheDocument();
  });

  it("renders primary Scan baru CTA", () => {
    render(<Dashboard />);
    expect(screen.getByTestId("new-scan-cta")).toHaveTextContent("Scan baru");
  });

  it("opens Scan baru menu with scan type links", async () => {
    render(<Dashboard />);
    await userEvent.click(screen.getByTestId("new-scan-cta"));
    expect(screen.getByRole("menuitem", { name: /Scan IP/i })).toHaveAttribute("href", "/scan/ip");
    expect(screen.getByRole("menuitem", { name: /Scan domain/i })).toHaveAttribute("href", "/scan/domain");
    expect(screen.getByRole("menuitem", { name: /Scan mobile/i })).toHaveAttribute("href", "/scan/mobile");
  });

  it("renders windowed KPI labels", () => {
    render(<Dashboard />);
    expect(screen.getByText("Risiko terbuka")).toBeInTheDocument();
    expect(screen.getByText("7 hari (C/H/M)")).toBeInTheDocument();
    expect(screen.getAllByText("Jadwal").length).toBeGreaterThan(0);
    expect(screen.getByText("Kredit")).toBeInTheDocument();
  });

  it("renders Pekerjaan terakhir section", () => {
    render(<Dashboard />);
    expect(screen.getByText("Pekerjaan terakhir")).toBeInTheDocument();
  });

  it("does not render Quick actions dump", () => {
    render(<Dashboard />);
    expect(screen.queryByText("Quick actions")).not.toBeInTheDocument();
    expect(screen.queryByText("New IP Scan")).not.toBeInTheDocument();
  });

  it("shows Belum ada scan when list is empty", () => {
    render(<Dashboard />);
    expect(screen.getByText("Belum ada scan")).toBeInTheDocument();
    expect(screen.getByTestId("empty-schedules-link")).toHaveAttribute(
      "href",
      "/schedules",
    );
  });

  it("shows Atur jadwal as primary when no schedules", () => {
    render(<Dashboard />);
    expect(screen.getByTestId("primary-jadwal-cta")).toBeInTheDocument();
  });

  it("shows loading skeletons when first loading", () => {
    mockUseScanHistory.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: false,
    });
    render(<Dashboard />);
    expect(screen.getByText("Ringkasan")).toBeInTheDocument();
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
    expect(screen.queryByText("example.com")).not.toBeInTheDocument();
    expect(screen.getByText(/Target percobaan disembunyikan/)).toBeInTheDocument();
  });

  it("shows real target after revealing lab rows", async () => {
    mockHistoryData.items = [
      {
        id: "scan-1",
        target: "stg3.dokfin.id",
        scan_type: "domain",
        status: "completed",
        started_at: "2026-01-01T00:00:00Z",
        result_summary: {
          total_findings: 8,
          critical: 0,
          high: 0,
          medium: 3,
          low: 5,
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
    expect(screen.getByText("stg3.dokfin.id")).toBeInTheDocument();
    expect(screen.getByText("3 sedang")).toBeInTheDocument();
    expect(screen.queryByText("completed")).not.toBeInTheDocument();
  });

  it("displays IP type label", () => {
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

  it("does not show Load more", () => {
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
    expect(screen.queryByText("Load more")).not.toBeInTheDocument();
  });

  it("shows total scan count in subtitle", () => {
    mockHistoryData.total = 42;
    mockUseScanHistory.mockReturnValue({
      data: mockHistoryData,
      isLoading: false,
      isFetching: false,
    });
    render(<Dashboard />);
    expect(screen.getByText(/42 scan sekali jalan/)).toBeInTheDocument();
  });

  it("clears scan history UI when activeOrgId changes", () => {
    mockHistoryData.items = [
      {
        id: "scan-a",
        target: "org-a.example.net",
        scan_type: "domain",
        status: "completed",
        started_at: "2026-01-01T00:00:00Z",
        result_summary: {
          total_findings: 1,
          critical: 0,
          high: 0,
          medium: 1,
          low: 0,
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

    const { rerender } = render(<Dashboard />);
    expect(screen.getByText("org-a.example.net")).toBeInTheDocument();

    mockHistoryData.items = [
      {
        id: "scan-b",
        target: "org-b.example.net",
        scan_type: "domain",
        status: "completed",
        started_at: "2026-02-01T00:00:00Z",
        result_summary: {
          total_findings: 2,
          critical: 1,
          high: 0,
          medium: 1,
          low: 0,
          info: 0,
        },
      },
    ];
    mockHistoryData.total = 1;
    mockUseScanHistory.mockReturnValue({
      data: { ...mockHistoryData, items: mockHistoryData.items },
      isLoading: false,
      isFetching: false,
    });

    act(() => {
      useAuthStore.setState({ activeOrgId: "org-b" });
    });
    rerender(<Dashboard />);

    expect(screen.queryByText("org-a.example.net")).not.toBeInTheDocument();
    expect(screen.getByText("org-b.example.net")).toBeInTheDocument();
  });

  it("does not show NaN when result_summary is error-only", () => {
    mockHistoryData.items = [
      {
        id: "scan-failed-1",
        target: "stg3.example.net",
        scan_type: "domain",
        status: "failed",
        started_at: null,
        result_summary: {
          error: "auto-failed: stuck pending > 30 minutes",
        } as unknown as (typeof mockHistoryData.items)[0]["result_summary"],
      },
      {
        id: "scan-ok-1",
        target: "ok.example.net",
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
    expect(screen.getByText("Risiko terbuka").previousElementSibling?.textContent).toBe("1");
    expect(screen.getByText("Gagal")).toBeInTheDocument();
  });
});
