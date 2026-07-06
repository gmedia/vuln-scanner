import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import AdminDashboard from "@/pages/admin/AdminDashboard";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("@/api/admin", () => ({
  adminApi: { getStats: vi.fn() },
}));

describe("AdminDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockStats = {
    total_users: 1500,
    total_scans: 8500,
    total_findings: 12000,
    credits_distributed: 50000,
    credits_used: 35000,
  };

  it("renders ADMIN DASHBOARD heading", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useQuery>);

    render(<AdminDashboard />);
    expect(screen.getByText("ADMIN DASHBOARD")).toBeInTheDocument();
  });

  it("shows skeletons while loading", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useQuery>);

    render(<AdminDashboard />);
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(5);
  });

  it("renders Total Users stat card when loaded", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: mockStats,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<AdminDashboard />);
    expect(screen.getByText("Total Users")).toBeInTheDocument();
    expect(screen.getByText("1,500")).toBeInTheDocument();
  });

  it("renders Total Scans stat card when loaded", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: mockStats,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<AdminDashboard />);
    expect(screen.getByText("Total Scans")).toBeInTheDocument();
    expect(screen.getByText("8,500")).toBeInTheDocument();
  });

  it("renders Total Findings stat card when loaded", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: mockStats,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<AdminDashboard />);
    expect(screen.getByText("Total Findings")).toBeInTheDocument();
    expect(screen.getByText("12,000")).toBeInTheDocument();
  });

  it("renders Credits Distributed stat card when loaded", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: mockStats,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<AdminDashboard />);
    expect(screen.getByText("Credits Distributed")).toBeInTheDocument();
    expect(screen.getByText("50,000")).toBeInTheDocument();
  });

  it("renders Credits Used stat card when loaded", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: mockStats,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<AdminDashboard />);
    expect(screen.getByText("Credits Used")).toBeInTheDocument();
    expect(screen.getByText("35,000")).toBeInTheDocument();
  });

  it("shows 0 for all stats when data is undefined", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<AdminDashboard />);
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(5);
  });

  it("does not show skeletons when loaded", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: mockStats,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<AdminDashboard />);
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(0);
  });
});
