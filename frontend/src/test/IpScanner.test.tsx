import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import IpScanner from "@/pages/IpScanner";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock("@/store/scanStore", () => ({
  useScanStore: vi.fn(),
}));

vi.mock("@/hooks/useScan", () => ({
  useScanDetail: vi.fn(),
}));

vi.mock("@/components/scan/IpScanForm", () => ({
  default: () => <div data-testid="ip-scan-form">ScanForm</div>,
}));

vi.mock("@/components/scan/ScanProgress", () => ({
  default: () => <div data-testid="scan-progress">Progress</div>,
}));

vi.mock("@/components/ui/Card", () => ({
  Card: ({ children, ...props }: any) => <div data-testid="card" {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div data-testid="card-header" {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <h3 data-testid="card-title" {...props}>{children}</h3>,
  CardContent: ({ children, ...props }: any) => <div data-testid="card-content" {...props}>{children}</div>,
}));

vi.mock("@/components/ui/Badge", () => ({
  Badge: ({ children, ...props }: any) => <span data-testid="badge" {...props}>{children}</span>,
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

import { useScanStore } from "@/store/scanStore";
import { useScanDetail } from "@/hooks/useScan";

describe("IpScanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <IpScanner />
      </MemoryRouter>,
    );
  }

  it("renders IP scanner heading", () => {
    vi.mocked(useScanStore).mockReturnValue(null);
    vi.mocked(useScanDetail).mockReturnValue({ data: undefined } as ReturnType<typeof useScanDetail>);

    renderPage();
    expect(screen.getByText("IP scanner")).toBeInTheDocument();
  });

  it("renders Scan target card", () => {
    vi.mocked(useScanStore).mockReturnValue(null);
    vi.mocked(useScanDetail).mockReturnValue({ data: undefined } as ReturnType<typeof useScanDetail>);

    renderPage();
    expect(screen.getByText("Scan target")).toBeInTheDocument();
  });

  it("renders the IpScanForm", () => {
    vi.mocked(useScanStore).mockReturnValue(null);
    vi.mocked(useScanDetail).mockReturnValue({ data: undefined } as ReturnType<typeof useScanDetail>);

    renderPage();
    expect(screen.getByTestId("ip-scan-form")).toBeInTheDocument();
  });

  it("does not show progress when no active job", () => {
    vi.mocked(useScanStore).mockReturnValue(null);
    vi.mocked(useScanDetail).mockReturnValue({ data: undefined } as ReturnType<typeof useScanDetail>);

    renderPage();
    expect(screen.queryByText("Scan progress")).not.toBeInTheDocument();
  });

  it("shows scan progress when scanning", () => {
    vi.mocked(useScanStore).mockReturnValue("job-123");
    vi.mocked(useScanDetail).mockReturnValue({
      data: { status: "running", result_summary: undefined } as any,
    } as ReturnType<typeof useScanDetail>);

    renderPage();
    expect(screen.getByText("Scan progress")).toBeInTheDocument();
    expect(screen.getByTestId("scan-progress")).toBeInTheDocument();
  });

  it("shows results when scan is completed", () => {
    vi.mocked(useScanStore).mockReturnValue("job-123");
    vi.mocked(useScanDetail).mockReturnValue({
      data: {
        status: "completed",
        result_summary: {
          critical: 1,
          high: 2,
          medium: 3,
          low: 4,
          info: 5,
          total_findings: 15,
        },
      } as any,
    } as ReturnType<typeof useScanDetail>);

    renderPage();
    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("15 findings found")).toBeInTheDocument();
  });

  it("shows singular finding text for 1 finding", () => {
    vi.mocked(useScanStore).mockReturnValue("job-123");
    vi.mocked(useScanDetail).mockReturnValue({
      data: {
        status: "completed",
        result_summary: {
          critical: 0,
          high: 0,
          medium: 1,
          low: 0,
          info: 0,
          total_findings: 1,
        },
      } as any,
    } as ReturnType<typeof useScanDetail>);

    renderPage();
    expect(screen.getByText("1 finding found")).toBeInTheDocument();
  });

  it("shows AlertTriangle when critical findings exist", () => {
    vi.mocked(useScanStore).mockReturnValue("job-123");
    vi.mocked(useScanDetail).mockReturnValue({
      data: {
        status: "completed",
        result_summary: {
          critical: 1,
          high: 0,
          medium: 0,
          low: 0,
          info: 0,
          total_findings: 1,
        },
      } as any,
    } as ReturnType<typeof useScanDetail>);

    renderPage();
    const alertIcon = document.querySelector(".lucide-triangle-alert");
    expect(alertIcon).toBeInTheDocument();
  });

  it("shows CheckCircle2 when no critical or high findings", () => {
    vi.mocked(useScanStore).mockReturnValue("job-123");
    vi.mocked(useScanDetail).mockReturnValue({
      data: {
        status: "completed",
        result_summary: {
          critical: 0,
          high: 0,
          medium: 1,
          low: 0,
          info: 0,
          total_findings: 1,
        },
      } as any,
    } as ReturnType<typeof useScanDetail>);

    renderPage();
    const checkIcon = document.querySelector(".lucide-circle-check");
    expect(checkIcon).toBeInTheDocument();
  });

  it("renders View Details button when results present", () => {
    vi.mocked(useScanStore).mockReturnValue("job-123");
    vi.mocked(useScanDetail).mockReturnValue({
      data: {
        status: "completed",
        result_summary: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          info: 0,
          total_findings: 0,
        },
      } as any,
    } as ReturnType<typeof useScanDetail>);

    renderPage();
    expect(screen.getByText("View Details")).toBeInTheDocument();
  });

  it("rails the scan-target shell primary", () => {
    vi.mocked(useScanStore).mockReturnValue(null);
    vi.mocked(useScanDetail).mockReturnValue({ data: undefined } as ReturnType<typeof useScanDetail>);

    renderPage();
    expect(
      screen.getByTestId("scan-target").querySelector(".bg-primary"),
    ).toBeTruthy();
  });

  it("rails the results shell destructive when critical findings exist", () => {
    vi.mocked(useScanStore).mockReturnValue("job-123");
    vi.mocked(useScanDetail).mockReturnValue({
      data: {
        status: "completed",
        result_summary: {
          critical: 2,
          high: 1,
          medium: 0,
          low: 0,
          info: 0,
          total_findings: 3,
        },
      } as any,
    } as ReturnType<typeof useScanDetail>);

    renderPage();
    const results = screen.getByTestId("scan-results");
    expect(results.firstElementChild?.className).toMatch(/bg-destructive/);
    expect(results.className).toMatch(/bg-destructive\/\[0\.04\]/);
  });

  it("rails the results shell yellow when only medium findings exist", () => {
    vi.mocked(useScanStore).mockReturnValue("job-123");
    vi.mocked(useScanDetail).mockReturnValue({
      data: {
        status: "completed",
        result_summary: {
          critical: 0,
          high: 0,
          medium: 2,
          low: 1,
          info: 3,
          total_findings: 6,
        },
      } as any,
    } as ReturnType<typeof useScanDetail>);

    renderPage();
    const results = screen.getByTestId("scan-results");
    expect(results.firstElementChild?.className).toMatch(/bg-yellow-500/);
    expect(results.className).not.toMatch(/bg-destructive/);
  });

  it("rails the results shell primary when the scan is fully clean", () => {
    vi.mocked(useScanStore).mockReturnValue("job-123");
    vi.mocked(useScanDetail).mockReturnValue({
      data: {
        status: "completed",
        result_summary: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          info: 0,
          total_findings: 0,
        },
      } as any,
    } as ReturnType<typeof useScanDetail>);

    renderPage();
    const results = screen.getByTestId("scan-results");
    expect(results.firstElementChild?.className).toMatch(/bg-primary/);
    expect(results.className).not.toMatch(/bg-destructive/);
  });

  it("rails each severity tile", () => {
    vi.mocked(useScanStore).mockReturnValue("job-123");
    vi.mocked(useScanDetail).mockReturnValue({
      data: {
        status: "completed",
        result_summary: {
          critical: 1,
          high: 2,
          medium: 3,
          low: 4,
          info: 5,
          total_findings: 15,
        },
      } as any,
    } as ReturnType<typeof useScanDetail>);

    renderPage();
    const results = screen.getByTestId("scan-results");
    expect(results.querySelector(".bg-destructive")).toBeTruthy();
    expect(results.querySelector(".bg-orange-500")).toBeTruthy();
    expect(results.querySelector(".bg-yellow-500")).toBeTruthy();
    expect(results.querySelector(".bg-blue-500")).toBeTruthy();
  });
});
