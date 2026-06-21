import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DomainScanForm from "@/components/scan/DomainScanForm";

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

describe("DomainScanForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders domain input with label", () => {
    render(<DomainScanForm />);
    expect(screen.getByText("TARGET DOMAIN")).toBeInTheDocument();
    const input = screen.getByPlaceholderText("example.com");
    expect(input).toBeInTheDocument();
  });

  it("renders submit button", () => {
    render(<DomainScanForm />);
    const button = screen.getByRole("button", { name: /start domain scan/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it("shows validation error for empty input", async () => {
    render(<DomainScanForm />);
    const button = screen.getByRole("button", { name: /start domain scan/i });
    fireEvent.click(button);
    expect(screen.getByText("Domain name is required")).toBeInTheDocument();
  });

  it("shows validation error for invalid domain", async () => {
    render(<DomainScanForm />);
    const input = screen.getByPlaceholderText("example.com");
    fireEvent.change(input, { target: { value: "not a domain!!!" } });
    const button = screen.getByRole("button", { name: /start domain scan/i });
    fireEvent.click(button);
    expect(
      screen.getByText("Invalid domain format (e.g. example.com)"),
    ).toBeInTheDocument();
  });

  it("shows hint text about domain format", () => {
    render(<DomainScanForm />);
    expect(
      screen.getByText(/e\.g\. example\.com, sub\.example\.com/i),
    ).toBeInTheDocument();
  });
});
