import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
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
vi.mock("@/hooks/useScanCredit", () => ({
  useScanCredit: vi.fn(() => ({
    credits: 100,
    cost: 10,
    eligible: true,
    eligibilityLoading: false,
    creditDisplay: React.createElement("div", { "data-testid": "credit-display" }, "Available Credits: 100"),
    costPreview: React.createElement("div", { "data-testid": "scan-cost-preview" }, "cost"),
    checkAndDeduct: vi.fn().mockResolvedValue({ eligible: true, error: null }),
    refreshAfterScan: vi.fn(),
  })),
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
    expect(screen.getByText("Target domain")).toBeInTheDocument();
    const input = screen.getByPlaceholderText("example.com");
    expect(input).toBeInTheDocument();
  });

  it("fills domain input when Try example.com chip is clicked", () => {
    render(<DomainScanForm />);
    const chip = screen.getByTestId("try-example-domain");
    fireEvent.click(chip);
    expect(screen.getByPlaceholderText("example.com")).toHaveValue("example.com");
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

  it("displays available credits", () => {
    render(<DomainScanForm />);
    expect(screen.getByTestId("credit-display")).toBeInTheDocument();
  });

  it("clears error when typing in input", () => {
    render(<DomainScanForm />);
    const input = screen.getByPlaceholderText("example.com");
    const button = screen.getByRole("button", { name: /start domain scan/i });
    fireEvent.click(button);
    expect(screen.getByText("Domain name is required")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "example.com" } });
    expect(screen.queryByText("Domain name is required")).not.toBeInTheDocument();
  });



  it("accepts valid domain format", () => {
    render(<DomainScanForm />);
    const input = screen.getByPlaceholderText("example.com");
    fireEvent.change(input, { target: { value: "example.com" } });
    expect(input).toHaveValue("example.com");
  });

  it("accepts valid subdomain format", () => {
    render(<DomainScanForm />);
    const input = screen.getByPlaceholderText("example.com");
    fireEvent.change(input, { target: { value: "sub.example.com" } });
    expect(input).toHaveValue("sub.example.com");
  });

  it("trims whitespace from domain input on display", () => {
    render(<DomainScanForm />);
    const input = screen.getByPlaceholderText("example.com");
    fireEvent.change(input, { target: { value: "  example.com  " } });
    expect(input).toHaveValue("  example.com  ");
  });

  it("submits on Enter key press", async () => {
    render(<DomainScanForm />);
    const input = screen.getByPlaceholderText("example.com");
    fireEvent.change(input, { target: { value: "example.com" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /start domain scan/i })).toBeInTheDocument();
    });
  });

  it("input is not disabled initially", () => {
    render(<DomainScanForm />);
    const input = screen.getByPlaceholderText("example.com");
    expect(input).not.toBeDisabled();
  });

  it("button shows correct text when not pending", () => {
    render(<DomainScanForm />);
    expect(screen.getByRole("button", { name: /start domain scan/i })).toBeInTheDocument();
  });

  it("error container is not visible when no error", () => {
    render(<DomainScanForm />);
    expect(screen.queryByText("Domain name is required")).not.toBeInTheDocument();
  });

  it("validates domain with numbers", async () => {
    render(<DomainScanForm />);
    const input = screen.getByPlaceholderText("example.com");
    fireEvent.change(input, { target: { value: "test123.com" } });
    const button = screen.getByRole("button", { name: /start domain scan/i });
    fireEvent.click(button);
    expect(screen.queryByText("Invalid domain format")).not.toBeInTheDocument();
  });

  it("validates domain with hyphens", async () => {
    render(<DomainScanForm />);
    const input = screen.getByPlaceholderText("example.com");
    fireEvent.change(input, { target: { value: "my-test-domain.com" } });
    const button = screen.getByRole("button", { name: /start domain scan/i });
    fireEvent.click(button);
    expect(screen.queryByText("Invalid domain format")).not.toBeInTheDocument();
  });

  it("rejects domain starting with hyphen", async () => {
    render(<DomainScanForm />);
    const input = screen.getByPlaceholderText("example.com");
    fireEvent.change(input, { target: { value: "-invalid.com" } });
    const button = screen.getByRole("button", { name: /start domain scan/i });
    fireEvent.click(button);
    expect(screen.getByText(/Invalid domain format/)).toBeInTheDocument();
  });

  it("rejects domain ending with hyphen", async () => {
    render(<DomainScanForm />);
    const input = screen.getByPlaceholderText("example.com");
    fireEvent.change(input, { target: { value: "invalid-.com" } });
    const button = screen.getByRole("button", { name: /start domain scan/i });
    fireEvent.click(button);
    expect(screen.getByText(/Invalid domain format/)).toBeInTheDocument();
  });

  it("rejects domain with single character TLD", async () => {
    render(<DomainScanForm />);
    const input = screen.getByPlaceholderText("example.com");
    fireEvent.change(input, { target: { value: "example.c" } });
    const button = screen.getByRole("button", { name: /start domain scan/i });
    fireEvent.click(button);
    expect(screen.getByText(/Invalid domain format/)).toBeInTheDocument();
  });

  it("accepts domain with multi-level subdomains", () => {
    render(<DomainScanForm />);
    const input = screen.getByPlaceholderText("example.com");
    fireEvent.change(input, { target: { value: "a.b.c.example.com" } });
    expect(input).toHaveValue("a.b.c.example.com");
  });
});
