import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ScanDetail from "@/pages/ScanDetail";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: "scan-1" }),
  };
});

vi.mock("@/hooks/useScan", () => ({
  useScanDetail: vi.fn(),
}));

vi.mock("@/api/scans", async () => {
  const actual = await vi.importActual("@/api/scans");
  return {
    ...actual,
    downloadFile: vi.fn(),
  };
});

vi.mock("@/components/ui/Card", () => ({
  Card: ({ children, ...props }: any) => <div data-testid="card" {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div data-testid="card-header" {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <h3 data-testid="card-title" {...props}>{children}</h3>,
  CardDescription: ({ children, ...props }: any) => <p data-testid="card-desc" {...props}>{children}</p>,
  CardContent: ({ children, ...props }: any) => <div data-testid="card-content" {...props}>{children}</div>,
}));

vi.mock("@/components/ui/Progress", () => ({
  Progress: ({ value, ...props }: any) => <div data-testid="progress" data-value={value} {...props} />,
}));

vi.mock("@/components/ui/Badge", () => ({
  Badge: ({ children, ...props }: any) => <span data-testid="badge" {...props}>{children}</span>,
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({ children, onClick, asChild, ...props }: any) => {
    if (asChild && children) {
      return children;
    }
    return (
      <button onClick={onClick} {...props}>{children}</button>
    );
  },
}));

vi.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (props: any) => <div data-testid="skeleton" {...props} />,
}));

vi.mock("@/lib/constants", () => ({
  SCAN_TYPE_LABELS: { ip: "IP Scan", domain: "Domain Scan", mobile: "Mobile Scan" },
}));

vi.mock("@/components/results/SeverityChart", () => ({
  default: ({ summary }: any) => <div data-testid="severity-chart" data-summary={JSON.stringify(summary)} />,
}));

vi.mock("@/components/results/FindingsTable", () => ({
  default: ({ findings }: any) => <div data-testid="findings-table" data-findings-count={findings?.length} />,
}));

import { useScanDetail } from "@/hooks/useScan";
import { downloadFile } from "@/api/scans";

const baseScan = {
  id: "scan-1",
  scan_type: "ip",
  target: "192.168.1.1",
  status: "completed",
  result_summary: {
    total_findings: 3,
    critical: 1,
    high: 1,
    medium: 1,
    low: 0,
    info: 0,
  },
  celery_task_id: "celery-abc",
  started_at: "2025-06-01T10:00:00Z",
  completed_at: "2025-06-01T10:01:30Z",
  created_at: "2025-06-01T10:00:00Z",
  findings: [
    {
      id: "f-1",
      job_id: "scan-1",
      severity: "critical",
      category: "auth",
      title: "Hardcoded password",
      description: "Found hardcoded password",
      cve_id: "CVE-2025-0001",
      cvss_score: 9.8,
      remediation: "Remove hardcoded password",
      raw_data: null,
      found_at: "2025-06-01T10:01:00Z",
    },
    {
      id: "f-2",
      job_id: "scan-1",
      severity: "high",
      category: "network",
      title: "Open port",
      description: "Port 22 open",
      cve_id: null,
      cvss_score: 7.5,
      remediation: null,
      raw_data: null,
      found_at: "2025-06-01T10:01:10Z",
    },
    {
      id: "f-3",
      job_id: "scan-1",
      severity: "medium",
      category: "config",
      title: "Weak cipher",
      description: null,
      cve_id: null,
      cvss_score: 5.0,
      remediation: "Upgrade cipher",
      raw_data: null,
      found_at: "2025-06-01T10:01:20Z",
    },
  ],
};

function mockUseScanDetailReturn(overrides: Partial<ReturnType<typeof useScanDetail>> = {}) {
  vi.mocked(useScanDetail).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...overrides,
  } as ReturnType<typeof useScanDetail>);
}

describe("ScanDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <ScanDetail />
      </MemoryRouter>,
    );
  }

  describe("loading state", () => {
    it("shows skeletons while loading", () => {
      mockUseScanDetailReturn({ isLoading: true });
      renderPage();
      const skeletons = screen.getAllByTestId("skeleton");
      expect(skeletons.length).toBe(3);
    });
  });

  describe("error state", () => {
    it("shows SCAN NOT FOUND on error", () => {
      mockUseScanDetailReturn({ isError: true });
      renderPage();
      expect(screen.getByText("SCAN NOT FOUND")).toBeInTheDocument();
    });

    it("shows Back to Dashboard link", () => {
      mockUseScanDetailReturn({ isError: true });
      renderPage();
      expect(screen.getByText("Back to Dashboard")).toBeInTheDocument();
    });

    it("shows SCAN NOT FOUND when scan is null", () => {
      mockUseScanDetailReturn({ data: null as any });
      renderPage();
      expect(screen.getByText("SCAN NOT FOUND")).toBeInTheDocument();
    });
  });

  describe("loaded state", () => {
    it("renders Scan details heading", () => {
      mockUseScanDetailReturn({ data: baseScan as any });
      renderPage();
      expect(screen.getByText("Scan details")).toBeInTheDocument();
    });

    it("renders scan target", () => {
      mockUseScanDetailReturn({ data: baseScan as any });
      renderPage();
      const targets = screen.getAllByText("192.168.1.1");
      expect(targets.length).toBe(2);
    });

    it("renders scan status badge", () => {
      mockUseScanDetailReturn({ data: baseScan as any });
      renderPage();
      expect(screen.getByText("completed")).toBeInTheDocument();
    });

    it("renders QuickStat for Target", () => {
      mockUseScanDetailReturn({ data: baseScan as any });
      renderPage();
      const targets = screen.getAllByText("192.168.1.1");
      expect(targets.length).toBeGreaterThanOrEqual(2);
    });

    it("renders scan type label", () => {
      mockUseScanDetailReturn({ data: baseScan as any });
      renderPage();
      expect(screen.getByText("IP Scan")).toBeInTheDocument();
    });

    it("renders findings count in QuickStat", () => {
      mockUseScanDetailReturn({ data: baseScan as any });
      renderPage();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("renders duration when completed", () => {
      mockUseScanDetailReturn({ data: baseScan as any });
      renderPage();
      expect(screen.getByText("1m 30s")).toBeInTheDocument();
    });

    it("renders duration from created_at when started_at is missing", () => {
      mockUseScanDetailReturn({
        data: {
          ...baseScan,
          started_at: null,
          created_at: "2025-06-01T10:00:00Z",
          completed_at: "2025-06-01T10:00:45Z",
        } as any,
      });
      renderPage();
      expect(screen.getByText("45s")).toBeInTheDocument();
    });

    it("renders N/A duration when not completed", () => {
      mockUseScanDetailReturn({
        data: { ...baseScan, completed_at: null, started_at: null } as any,
      });
      renderPage();
      expect(screen.getByText("N/A")).toBeInTheDocument();
    });

    it("renders Severity card", () => {
      mockUseScanDetailReturn({ data: baseScan as any });
      renderPage();
      expect(screen.getByText("Severity")).toBeInTheDocument();
    });

    it("renders severity chart", () => {
      mockUseScanDetailReturn({ data: baseScan as any });
      renderPage();
      expect(screen.getByTestId("severity-chart")).toBeInTheDocument();
    });

    it("renders Scan info card", () => {
      mockUseScanDetailReturn({ data: baseScan as any });
      renderPage();
      expect(screen.getByText("Scan info")).toBeInTheDocument();
    });

    it("renders Task ID when celery_task_id exists", () => {
      mockUseScanDetailReturn({ data: baseScan as any });
      renderPage();
      expect(screen.getByText("celery-abc")).toBeInTheDocument();
    });

    it("does not render Task ID when celery_task_id is null", () => {
      mockUseScanDetailReturn({
        data: { ...baseScan, celery_task_id: null } as any,
      });
      renderPage();
      expect(screen.queryByText("Task ID")).not.toBeInTheDocument();
    });

    it("renders RemediationCard when findings have remediation", () => {
      mockUseScanDetailReturn({ data: baseScan as any });
      renderPage();
      expect(screen.getByText("Remediation Available")).toBeInTheDocument();
      const progress = screen.getByTestId("progress");
      expect(progress.dataset.value).toBe("67");
    });

    it("does not render RemediationCard when no findings", () => {
      mockUseScanDetailReturn({
        data: { ...baseScan, findings: [] } as any,
      });
      renderPage();
      expect(screen.queryByText("Remediation Available")).not.toBeInTheDocument();
    });

    it("renders Findings card", () => {
      mockUseScanDetailReturn({ data: baseScan as any });
      renderPage();
      expect(screen.getAllByText("Findings").length).toBeGreaterThanOrEqual(1);
    });

    it("renders findings table before severity chart in DOM order", () => {
      mockUseScanDetailReturn({ data: baseScan as any });
      renderPage();
      const table = screen.getByTestId("findings-table");
      const chart = screen.getByTestId("severity-chart");
      expect(table.dataset.findingsCount).toBe("3");
      expect(
        table.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("renders download buttons", () => {
      mockUseScanDetailReturn({ data: baseScan as any });
      renderPage();
      expect(screen.getByText("JSON")).toBeInTheDocument();
      expect(screen.getByText("HTML")).toBeInTheDocument();
    });

    it("renders Re-scan link for IP scan type", () => {
      mockUseScanDetailReturn({ data: baseScan as any });
      renderPage();
      const rescan = screen.getByTestId("rescan-button");
      expect(rescan).toHaveAttribute("href", "/scan/ip");
      expect(screen.getByRole("link", { name: /Re-scan/i })).toBeInTheDocument();
    });

    it("routes Re-scan to domain scanner for domain scans", () => {
      mockUseScanDetailReturn({
        data: { ...baseScan, scan_type: "domain" } as any,
      });
      renderPage();
      expect(screen.getByRole("link", { name: /Re-scan/i })).toHaveAttribute(
        "href",
        "/scan/domain",
      );
    });

    it("calls downloadFile with JSON on JSON button click", async () => {
      mockUseScanDetailReturn({ data: baseScan as any });
      renderPage();
      await userEvent.click(screen.getByText("JSON"));
      expect(downloadFile).toHaveBeenCalledWith("scan-1", "json");
    });

    it("calls downloadFile with HTML on HTML button click", async () => {
      mockUseScanDetailReturn({ data: baseScan as any });
      renderPage();
      await userEvent.click(screen.getByText("HTML"));
      expect(downloadFile).toHaveBeenCalledWith("scan-1", "html");
    });

    it("renders running status without findings", () => {
      mockUseScanDetailReturn({
        data: {
          ...baseScan,
          status: "running",
          result_summary: null,
          findings: undefined,
          completed_at: null,
        } as any,
      });
      renderPage();
      expect(screen.getByText("running")).toBeInTheDocument();
      expect(screen.getByText("N/A")).toBeInTheDocument();
    });
  });
});
