import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Header from "@/components/layout/Header";
import { useScanStore } from "@/store/scanStore";

describe("Header", () => {
  beforeEach(() => {
    useScanStore.setState({
      activeJobId: null,
      scanType: null,
      progress: 0,
      status: "pending",
    });
  });

  it("renders brand name VULNSCAN", () => {
    render(<Header />);
    expect(screen.getByText("VULN")).toBeInTheDocument();
    expect(screen.getByText("SCAN")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(
      <Header>
        <button>Test Child</button>
      </Header>,
    );
    expect(screen.getByRole("button", { name: "Test Child" })).toBeInTheDocument();
  });

  it("shows scan progress when activeJobId is set", () => {
    useScanStore.setState({
      activeJobId: "job-123",
      scanType: "ip",
      progress: 45,
    });
    render(<Header />);
    expect(screen.getByText("IP Address")).toBeInTheDocument();
    expect(screen.getByText("45%")).toBeInTheDocument();
  });

  it("hides progress when no active scan", () => {
    render(<Header />);
    expect(screen.queryByText("%")).toBeNull();
  });

  it("renders with different scan type label", () => {
    useScanStore.setState({
      activeJobId: "job-456",
      scanType: "domain",
      progress: 80,
    });
    render(<Header />);
    expect(screen.getByText("Domain")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("renders scanType fallback when label not found", () => {
    useScanStore.setState({
      activeJobId: "job-789",
      scanType: "unknown_type",
      progress: 10,
    });
    render(<Header />);
    expect(screen.getByText("unknown_type")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
  });
});
