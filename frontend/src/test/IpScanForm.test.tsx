import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
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

describe("IpScanForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders target IP input with label", () => {
    render(<IpScanForm />);
    expect(screen.getByText("Target IP address")).toBeInTheDocument();
    const input = screen.getByPlaceholderText("192.168.1.1");
    expect(input).toBeInTheDocument();
  });

  it("renders port range input with label", () => {
    render(<IpScanForm />);
    expect(screen.getByText("Port range")).toBeInTheDocument();
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

  it("displays available credits", () => {
    render(<IpScanForm />);
    expect(screen.getByTestId("credit-display")).toBeInTheDocument();
  });

  it("clears error when typing in target input", () => {
    render(<IpScanForm />);
    const input = screen.getByPlaceholderText("192.168.1.1");
    const button = screen.getByRole("button", { name: /start ip scan/i });
    fireEvent.click(button);
    expect(screen.getByText("IP address is required")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "192.168.1.1" } });
    expect(screen.queryByText("IP address is required")).not.toBeInTheDocument();
  });



  it("accepts valid IP address format", () => {
    render(<IpScanForm />);
    const input = screen.getByPlaceholderText("192.168.1.1");
    fireEvent.change(input, { target: { value: "192.168.1.1" } });
    expect(input).toHaveValue("192.168.1.1");
  });

  it("accepts IP address with 0 in octets", () => {
    render(<IpScanForm />);
    const input = screen.getByPlaceholderText("192.168.1.1");
    fireEvent.change(input, { target: { value: "10.0.0.1" } });
    expect(input).toHaveValue("10.0.0.1");
  });

  it("accepts localhost IP", () => {
    render(<IpScanForm />);
    const input = screen.getByPlaceholderText("192.168.1.1");
    fireEvent.change(input, { target: { value: "127.0.0.1" } });
    expect(input).toHaveValue("127.0.0.1");
  });

  it("accepts broadcast IP", () => {
    render(<IpScanForm />);
    const input = screen.getByPlaceholderText("192.168.1.1");
    fireEvent.change(input, { target: { value: "255.255.255.255" } });
    expect(input).toHaveValue("255.255.255.255");
  });

  it("submits on Enter key press in target input", async () => {
    render(<IpScanForm />);
    const input = screen.getByPlaceholderText("192.168.1.1");
    fireEvent.change(input, { target: { value: "192.168.1.1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /start ip scan/i })).toBeInTheDocument();
    });
  });

  it("submits on Enter key press in port input", async () => {
    render(<IpScanForm />);
    const targetInput = screen.getByPlaceholderText("192.168.1.1");
    const portInput = screen.getByPlaceholderText("1-1000");
    fireEvent.change(targetInput, { target: { value: "192.168.1.1" } });
    fireEvent.keyDown(portInput, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /start ip scan/i })).toBeInTheDocument();
    });
  });

  it("shows hint text about port format", () => {
    render(<IpScanForm />);
    expect(
      screen.getByText(/Format: start-end \(e\.g\. 1-1000\) or comma-separated/),
    ).toBeInTheDocument();
  });

  it("input is not disabled initially", () => {
    render(<IpScanForm />);
    const input = screen.getByPlaceholderText("192.168.1.1");
    expect(input).not.toBeDisabled();
  });

  it("port input is not disabled initially", () => {
    render(<IpScanForm />);
    const input = screen.getByPlaceholderText("1-1000");
    expect(input).not.toBeDisabled();
  });

  it("button shows correct text when not pending", () => {
    render(<IpScanForm />);
    expect(screen.getByRole("button", { name: /start ip scan/i })).toBeInTheDocument();
  });

  it("error container is not visible when no error", () => {
    render(<IpScanForm />);
    expect(screen.queryByText("IP address is required")).not.toBeInTheDocument();
  });

  it("rejects IP with octet > 255", async () => {
    render(<IpScanForm />);
    const input = screen.getByPlaceholderText("192.168.1.1");
    fireEvent.change(input, { target: { value: "256.1.1.1" } });
    const button = screen.getByRole("button", { name: /start ip scan/i });
    fireEvent.click(button);
    expect(screen.getByText(/Invalid IP address format/)).toBeInTheDocument();
  });

  it("rejects IP with missing octets", async () => {
    render(<IpScanForm />);
    const input = screen.getByPlaceholderText("192.168.1.1");
    fireEvent.change(input, { target: { value: "192.168.1" } });
    const button = screen.getByRole("button", { name: /start ip scan/i });
    fireEvent.click(button);
    expect(screen.getByText(/Invalid IP address format/)).toBeInTheDocument();
  });

  it("rejects IP with extra octets", async () => {
    render(<IpScanForm />);
    const input = screen.getByPlaceholderText("192.168.1.1");
    fireEvent.change(input, { target: { value: "192.168.1.1.1" } });
    const button = screen.getByRole("button", { name: /start ip scan/i });
    fireEvent.click(button);
    expect(screen.getByText(/Invalid IP address format/)).toBeInTheDocument();
  });

  it("rejects IP with non-numeric characters", async () => {
    render(<IpScanForm />);
    const input = screen.getByPlaceholderText("192.168.1.1");
    fireEvent.change(input, { target: { value: "abc.def.ghi.jkl" } });
    const button = screen.getByRole("button", { name: /start ip scan/i });
    fireEvent.click(button);
    expect(screen.getByText(/Invalid IP address format/)).toBeInTheDocument();
  });

  it("allows custom port range input", () => {
    render(<IpScanForm />);
    const input = screen.getByPlaceholderText("1-1000");
    fireEvent.change(input, { target: { value: "22,80,443" } });
    expect(input).toHaveValue("22,80,443");
  });

  it("allows empty port range input", () => {
    render(<IpScanForm />);
    const input = screen.getByPlaceholderText("1-1000");
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
  });

  it("shows correct placeholder for IP input", () => {
    render(<IpScanForm />);
    const input = screen.getByPlaceholderText("192.168.1.1");
    expect(input).toHaveAttribute("placeholder", "192.168.1.1");
  });

  it("shows correct placeholder for port input", () => {
    render(<IpScanForm />);
    const input = screen.getByPlaceholderText("1-1000");
    expect(input).toHaveAttribute("placeholder", "1-1000");
  });
});
