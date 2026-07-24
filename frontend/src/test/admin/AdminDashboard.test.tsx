import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AdminDashboard from "@/pages/admin/AdminDashboard";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("@/api/admin", () => ({
  adminApi: { getStats: vi.fn() },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>,
  );
}

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

  it("renders Admin dashboard heading", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useQuery>);

    renderPage();
    expect(screen.getByText("Admin dashboard")).toBeInTheDocument();
  });

  it("renders All-time overview subtitle", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useQuery>);

    renderPage();
    expect(screen.getByText("All-time overview")).toBeInTheDocument();
  });

  it("shows skeletons while loading", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useQuery>);

    renderPage();
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(5);
  });

  it("renders Total users stat card when loaded", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: mockStats,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderPage();
    expect(screen.getByText("Total users")).toBeInTheDocument();
    expect(screen.getByText("1,500")).toBeInTheDocument();
  });

  it("renders Total scans stat card when loaded", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: mockStats,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderPage();
    expect(screen.getByText("Total scans")).toBeInTheDocument();
    expect(screen.getByText("8,500")).toBeInTheDocument();
  });

  it("renders Total findings stat card when loaded", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: mockStats,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderPage();
    expect(screen.getByText("Total findings")).toBeInTheDocument();
    expect(screen.getByText("12,000")).toBeInTheDocument();
  });

  it("renders Credits distributed stat card when loaded", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: mockStats,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderPage();
    expect(screen.getByText("Credits distributed")).toBeInTheDocument();
    expect(screen.getByText("50,000")).toBeInTheDocument();
  });

  it("renders Credits used stat card when loaded", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: mockStats,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderPage();
    expect(screen.getByText("Credits used")).toBeInTheDocument();
    expect(screen.getByText("35,000")).toBeInTheDocument();
  });

  it("shows 0 for all stats when data is undefined", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderPage();
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(5);
  });

  it("does not show skeletons when loaded", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: mockStats,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderPage();
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(0);
  });

  it("renders quick links to user management and pricing", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: mockStats,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderPage();
    expect(screen.getByText("User management")).toBeInTheDocument();
    expect(screen.getByText("Pricing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /User management/i })).toHaveAttribute(
      "href",
      "/admin/users",
    );
    expect(screen.getByRole("link", { name: /Pricing/i })).toHaveAttribute(
      "href",
      "/admin/pricing",
    );
  });
});
