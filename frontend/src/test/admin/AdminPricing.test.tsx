import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminPricing from "@/pages/admin/AdminPricing";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("@/api/admin", () => ({
  adminApi: {
    getPricing: vi.fn(),
    updatePricing: vi.fn(),
  },
}));

vi.mock("@/components/ui/Card", () => ({
  Card: ({ children, ...props }: { children: React.ReactNode }) => (
    <div data-testid="card" {...props}>
      {children}
    </div>
  ),
  CardHeader: ({ children, ...props }: { children: React.ReactNode }) => (
    <div data-testid="card-header" {...props}>
      {children}
    </div>
  ),
  CardTitle: ({ children, ...props }: { children: React.ReactNode }) => (
    <h3 data-testid="card-title" {...props}>
      {children}
    </h3>
  ),
  CardContent: ({ children, ...props }: { children: React.ReactNode }) => (
    <div data-testid="card-content" {...props}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/Badge", () => ({
  Badge: ({ children, ...props }: { children: React.ReactNode }) => (
    <span data-testid="badge" {...props}>
      {children}
    </span>
  ),
}));

vi.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (props: Record<string, unknown>) => (
    <div data-testid="skeleton" {...props} />
  ),
  TableRowSkeleton: ({ rows = 5 }: { rows?: number }) => (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} data-testid="skeleton" />
      ))}
    </div>
  ),
}));

import { useQuery } from "@tanstack/react-query";

const basePricing = [
  { id: "1", scan_type: "ip", credit_cost: 5, updated_at: "2025-06-01T10:00:00Z" },
  { id: "2", scan_type: "domain", credit_cost: 10, updated_at: "2025-06-01T10:00:00Z" },
  { id: "3", scan_type: "mobile", credit_cost: 15, updated_at: "2025-06-01T10:00:00Z" },
];

function mockUseQueryReturn(overrides: Partial<{ data: unknown; isLoading: boolean; isError: boolean }> = {}) {
  vi.mocked(useQuery).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...overrides,
  } as ReturnType<typeof useQuery>);
}

describe("AdminPricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <AdminPricing />
      </MemoryRouter>,
    );
  }

  describe("loading state", () => {
    it("shows skeletons while loading", () => {
      mockUseQueryReturn({ isLoading: true });
      renderPage();
      const skeletons = screen.getAllByTestId("skeleton");
      expect(skeletons.length).toBe(4);
    });
  });

  describe("empty state", () => {
    it("shows No pricing configured when empty", () => {
      mockUseQueryReturn({ data: [] });
      renderPage();
      expect(screen.getByText("No pricing configured")).toBeInTheDocument();
    });
  });

  describe("loaded state", () => {
    it("renders leftover banner and HPP link", () => {
      mockUseQueryReturn({ data: basePricing });
      renderPage();
      expect(screen.getByTestId("pricing-leftover-banner")).toBeInTheDocument();
      expect(screen.getByText("Not a customer meter")).toBeInTheDocument();
      expect(screen.getByTestId("pricing-link-hpp")).toHaveAttribute(
        "href",
        "/admin/hpp",
      );
    });

    it("renders PRICING CONFIGURATION heading", () => {
      mockUseQueryReturn({ data: basePricing });
      renderPage();
      expect(screen.getByText("Pricing configuration")).toBeInTheDocument();
    });

    it("renders archive card title", () => {
      mockUseQueryReturn({ data: basePricing });
      renderPage();
      expect(screen.getByText("Scan credit seed (archive)")).toBeInTheDocument();
    });

    it("renders table headers without Actions", () => {
      mockUseQueryReturn({ data: basePricing });
      renderPage();
      expect(screen.getByText("Scan type")).toBeInTheDocument();
      expect(screen.getByText("Credit cost (seed)")).toBeInTheDocument();
      expect(screen.getByText("Updated")).toBeInTheDocument();
      expect(screen.queryByText("Actions")).not.toBeInTheDocument();
    });

    it("renders all pricing items as text, not inputs", () => {
      mockUseQueryReturn({ data: basePricing });
      renderPage();
      expect(screen.getAllByText("ip").length).toBeGreaterThan(0);
      expect(screen.getAllByText("domain").length).toBeGreaterThan(0);
      expect(screen.getAllByText("mobile").length).toBeGreaterThan(0);
      expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
      expect(screen.getAllByText("5").length).toBeGreaterThan(0);
      expect(screen.getAllByText("10").length).toBeGreaterThan(0);
      expect(screen.getAllByText("15").length).toBeGreaterThan(0);
    });

    it("shows updated date", () => {
      mockUseQueryReturn({ data: basePricing });
      renderPage();
      const dates = screen.getAllByText("6/1/2025");
      expect(dates.length).toBeGreaterThanOrEqual(3);
    });

    it("does not render Save or Saved buttons", () => {
      mockUseQueryReturn({ data: basePricing });
      renderPage();
      expect(screen.queryByText("Save")).not.toBeInTheDocument();
      expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    });
  });
});
