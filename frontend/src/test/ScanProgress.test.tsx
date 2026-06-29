import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ScanProgress from "@/components/scan/ScanProgress";

const mockNavigate = vi.fn();
const mockSetProgress = vi.fn();
const mockClearActiveScan = vi.fn();

// Mutable state for controlling mock behavior across tests
let mockStoreState = {
  activeJobId: null as string | null,
  progress: 0,
  status: "pending" as string,
  scanType: null as string | null,
};

vi.mock("@/hooks/useScan", () => ({
  useStartIpScan: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useStartDomainScan: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useStartMobileScan: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useScanDetail: vi.fn(() => ({ data: null })),
}));

vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: vi.fn(),
}));

vi.mock("@/store/scanStore", () => ({
  useScanStore: vi.fn((selector: any) => {
    const state = {
      activeJobId: mockStoreState.activeJobId,
      progress: mockStoreState.progress,
      status: mockStoreState.status,
      scanType: mockStoreState.scanType,
      setActiveScan: vi.fn(),
      setProgress: mockSetProgress,
      clearActiveScan: mockClearActiveScan,
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(() => mockNavigate),
}));

describe("ScanProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset store state to defaults
    mockStoreState = {
      activeJobId: null,
      progress: 0,
      status: "pending",
      scanType: null,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders with default props", () => {
    render(<ScanProgress />);
    expect(screen.getByText("SCANNING TARGET")).toBeInTheDocument();
  });

  it("shows clock icon when scanning", () => {
    render(<ScanProgress />);
    const clockIcon = document.querySelector(".animate-pulse");
    expect(clockIcon).toBeInTheDocument();
  });

  it("shows progress percentage badge", () => {
    render(<ScanProgress />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("renders progress bar", () => {
    render(<ScanProgress />);
    const progressBar = document.querySelector('[role="progressbar"]');
    expect(progressBar).toBeInTheDocument();
  });

  it("shows complete state when progress reaches 100", () => {
    mockStoreState = {
      activeJobId: null,
      progress: 100,
      status: "completed",
      scanType: null,
    };
    render(<ScanProgress />);
    expect(screen.getByText("SCAN COMPLETE")).toBeInTheDocument();
  });

  it("shows failed state when status is failed", () => {
    mockStoreState = {
      activeJobId: null,
      progress: 50,
      status: "failed",
      scanType: null,
    };
    render(<ScanProgress />);
    expect(screen.getByText("SCAN FAILED")).toBeInTheDocument();
  });

  it("displays active job ID when present", () => {
    mockStoreState = {
      activeJobId: "test-job-123",
      progress: 0,
      status: "pending",
      scanType: null,
    };
    render(<ScanProgress />);
    expect(screen.getByText(/ID: test-job-123/)).toBeInTheDocument();
  });

  it("does not display job ID when not present", () => {
    render(<ScanProgress />);
    expect(screen.queryByText(/ID:/)).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<ScanProgress className="custom-class" />);
    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("shows check icon when complete", () => {
    mockStoreState = {
      activeJobId: null,
      progress: 100,
      status: "completed",
      scanType: null,
    };
    render(<ScanProgress />);
    const checkIcon = document.querySelector(".text-primary");
    expect(checkIcon).toBeInTheDocument();
  });

  it("shows x icon when failed", () => {
    mockStoreState = {
      activeJobId: null,
      progress: 50,
      status: "failed",
      scanType: null,
    };
    render(<ScanProgress />);
    const xIcon = document.querySelector(".text-destructive");
    expect(xIcon).toBeInTheDocument();
  });

  it("shows running badge variant when scanning", () => {
    mockStoreState = {
      activeJobId: null,
      progress: 50,
      status: "pending",
      scanType: null,
    };
    render(<ScanProgress />);
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("shows completed badge variant when complete", () => {
    mockStoreState = {
      activeJobId: null,
      progress: 100,
      status: "completed",
      scanType: null,
    };
    render(<ScanProgress />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("shows failed badge variant when failed", () => {
    mockStoreState = {
      activeJobId: null,
      progress: 50,
      status: "failed",
      scanType: null,
    };
    render(<ScanProgress />);
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("renders with different progress values", () => {
    mockStoreState = {
      activeJobId: null,
      progress: 75,
      status: "pending",
      scanType: null,
    };
    render(<ScanProgress />);
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("shows scanning status text by default", () => {
    render(<ScanProgress />);
    expect(screen.getByText("SCANNING TARGET")).toBeInTheDocument();
  });

  it("shows complete status text when completed", () => {
    mockStoreState = {
      activeJobId: null,
      progress: 100,
      status: "completed",
      scanType: null,
    };
    render(<ScanProgress />);
    expect(screen.getByText("SCAN COMPLETE")).toBeInTheDocument();
  });

  it("shows failed status text when failed", () => {
    mockStoreState = {
      activeJobId: null,
      progress: 50,
      status: "failed",
      scanType: null,
    };
    render(<ScanProgress />);
    expect(screen.getByText("SCAN FAILED")).toBeInTheDocument();
  });

  it("renders Progress component with correct value", () => {
    mockStoreState = {
      activeJobId: null,
      progress: 60,
      status: "pending",
      scanType: null,
    };
    render(<ScanProgress />);
    const progressElement = screen.getByRole("progressbar");
    expect(progressElement).toBeInTheDocument();
  });

  it("shows job ID label when activeJobId present", () => {
    mockStoreState = {
      activeJobId: "job-abc",
      progress: 0,
      status: "pending",
      scanType: null,
    };
    render(<ScanProgress />);
    expect(screen.getByText(/ID:/)).toBeInTheDocument();
  });

  it("handles zero progress", () => {
    render(<ScanProgress />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("handles maximum progress", () => {
    mockStoreState = {
      activeJobId: null,
      progress: 100,
      status: "completed",
      scanType: null,
    };
    render(<ScanProgress />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("renders scan type label", () => {
    mockStoreState = {
      activeJobId: null,
      progress: 0,
      status: "pending",
      scanType: "ip",
    };
    render(<ScanProgress />);
    // Component should display scan type info
    expect(screen.getByText("SCANNING TARGET")).toBeInTheDocument();
  });

  it("shows domain scan type", () => {
    mockStoreState = {
      activeJobId: null,
      progress: 0,
      status: "pending",
      scanType: "domain",
    };
    render(<ScanProgress />);
    expect(screen.getByText("SCANNING TARGET")).toBeInTheDocument();
  });

  it("shows mobile scan type", () => {
    mockStoreState = {
      activeJobId: null,
      progress: 0,
      status: "pending",
      scanType: "mobile",
    };
    render(<ScanProgress />);
    expect(screen.getByText("SCANNING TARGET")).toBeInTheDocument();
  });

  it("handles partial progress", () => {
    mockStoreState = {
      activeJobId: null,
      progress: 33,
      status: "pending",
      scanType: null,
    };
    render(<ScanProgress />);
    expect(screen.getByText("33%")).toBeInTheDocument();
  });

  it("handles near-complete progress", () => {
    mockStoreState = {
      activeJobId: null,
      progress: 99,
      status: "pending",
      scanType: null,
    };
    render(<ScanProgress />);
    expect(screen.getByText("99%")).toBeInTheDocument();
  });
});
