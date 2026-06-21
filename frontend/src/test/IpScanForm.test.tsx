import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import IpScanForm from "@/components/scan/IpScanForm";

vi.mock("@/hooks/useScan", () => ({
  useStartIpScan: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useStartDomainScan: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useStartMobileScan: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));
vi.mock("@/store/scanStore", () => ({
  useScanStore: vi.fn((selector) => {
    const state = {
      activeJobId: null,
      progress: 0,
      status: "pending",
      scanType: null,
      setActiveScan: vi.fn(),
      setProgress: vi.fn(),
      clearActiveScan: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));
vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(() => vi.fn()),
}));

describe("IpScanForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders target IP input with label", () => {
    render(<IpScanForm />);
    expect(screen.getByText("TARGET IP ADDRESS")).toBeInTheDocument();
    const input = screen.getByPlaceholderText("192.168.1.1");
    expect(input).toBeInTheDocument();
  });

  it("renders port range input with label", () => {
    render(<IpScanForm />);
    expect(screen.getByText("PORT RANGE")).toBeInTheDocument();
    const input = screen.getByPlaceholderText("1-1000");
    expect(input).toBeInTheDocument();
  });

  it("renders submit button", () => {
    render(<IpScanForm />);
    const button = screen.getByRole("button", { name: /start ip scan/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it("shows validation error for empty input", async () => {
    render(<IpScanForm />);
    const button = screen.getByRole("button", { name: /start ip scan/i });
    await fireEvent.click(button);
    expect(screen.getByText("IP address is required")).toBeInTheDocument();
  });

  it("shows validation error for invalid IP format", async () => {
    render(<IpScanForm />);
    const input = screen.getByPlaceholderText("192.168.1.1");
    fireEvent.change(input, { target: { value: "not-an-ip" } });
    const button = screen.getByRole("button", { name: /start ip scan/i });
    fireEvent.click(button);
    expect(
      screen.getByText("Invalid IP address format (e.g. 192.168.1.1)"),
    ).toBeInTheDocument();
  });

  it("port input has default value 1-1000", () => {
    render(<IpScanForm />);
    const input = screen.getByPlaceholderText("1-1000");
    expect(input).toHaveValue("1-1000");
  });
});
