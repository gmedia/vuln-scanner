import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AdminUsers from "@/pages/admin/AdminUsers";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  keepPreviousData: (prev: unknown) => prev,
}));

vi.mock("@/api/admin", () => ({
  adminApi: {
    getUsers: vi.fn(),
  },
}));

vi.mock("@/components/ui/Card", () => ({
  Card: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <div data-testid="card" {...props}>{children}</div>
  ),
  CardHeader: ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
    <div data-testid="card-header" className={className} {...props}>{children}</div>
  ),
  CardTitle: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <h3 data-testid="card-title" {...props}>{children}</h3>
  ),
  CardContent: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <div data-testid="card-content" {...props}>{children}</div>
  ),
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({
    children,
    disabled,
    onClick,
    ...props
  }: {
    children?: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <button disabled={disabled} onClick={onClick} {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/Input", () => ({
  Input: ({
    value,
    onChange,
    placeholder,
    ...props
  }: {
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    [key: string]: unknown;
  }) => (
    <input value={value} onChange={onChange} placeholder={placeholder} {...props} />
  ),
}));

vi.mock("@/components/ui/Badge", () => ({
  Badge: ({
    children,
    variant,
    ...props
  }: {
    children?: React.ReactNode;
    variant?: string;
    [key: string]: unknown;
  }) => <span data-variant={variant} {...props}>{children}</span>,
}));

vi.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (props: { [key: string]: unknown }) => <div data-testid="skeleton" {...props} />,
}));

import { useQuery } from "@tanstack/react-query";

function mockUseQueryReturn(overrides: Partial<ReturnType<typeof useQuery>> = {}) {
  vi.mocked(useQuery).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  } as ReturnType<typeof useQuery>);
}

describe("AdminUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <AdminUsers />
      </MemoryRouter>,
    );
  }

  it("renders User management heading", () => {
    mockUseQueryReturn();
    renderPage();
    expect(screen.getByText("User management")).toBeInTheDocument();
  });

  it("renders Users card title", () => {
    mockUseQueryReturn();
    renderPage();
    expect(screen.getByText("Users")).toBeInTheDocument();
  });

  it("renders search input", () => {
    mockUseQueryReturn();
    renderPage();
    expect(screen.getByPlaceholderText("Search email...")).toBeInTheDocument();
  });

  describe("loading state", () => {
    it("shows skeletons while loading", () => {
      mockUseQueryReturn({ isLoading: true });
      renderPage();
      const skeletons = screen.getAllByTestId("skeleton");
      expect(skeletons.length).toBe(5);
    });
  });

  describe("empty state", () => {
    it("shows no users message when data is empty", () => {
      mockUseQueryReturn({ data: { users: [], total: 0 } });
      renderPage();
      expect(screen.getByText("No users found")).toBeInTheDocument();
      expect(screen.getByText("No users registered yet.")).toBeInTheDocument();
    });

    it("shows empty state with data undefined", () => {
      mockUseQueryReturn({ data: undefined });
      renderPage();
      expect(screen.getByText("No users found")).toBeInTheDocument();
    });
  });

  describe("populated state", () => {
    const mockUsers = [
      {
        id: "1",
        email: "admin@test.com",
        is_admin: true,
        is_verified: true,
        credits: 100,
        scan_count: 42,
        created_at: "2025-01-15T00:00:00Z",
      },
      {
        id: "2",
        email: "user@test.com",
        is_admin: false,
        is_verified: false,
        credits: 10,
        scan_count: 3,
        created_at: "2025-06-01T00:00:00Z",
      },
    ];

    it("renders user rows in table", () => {
      mockUseQueryReturn({ data: { users: mockUsers, total: 2 } });
      renderPage();
      expect(screen.getAllByText("admin@test.com").length).toBeGreaterThan(0);
      expect(screen.getAllByText("user@test.com").length).toBeGreaterThan(0);
    });

    it("shows total count", () => {
      mockUseQueryReturn({ data: { users: mockUsers, total: 2 } });
      renderPage();
      expect(screen.getByText("2 total")).toBeInTheDocument();
    });

    it("renders Admin badge for admin user", () => {
      mockUseQueryReturn({ data: { users: mockUsers, total: 2 } });
      renderPage();
      expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
    });

    it("renders User badge for non-admin user", () => {
      mockUseQueryReturn({ data: { users: mockUsers, total: 2 } });
      renderPage();
      expect(screen.getAllByText("User").length).toBeGreaterThan(0);
    });

    it("renders Verified and Unverified badges", () => {
      mockUseQueryReturn({ data: { users: mockUsers, total: 2 } });
      renderPage();
      const verifiedBadges = screen
        .getAllByText("Verified")
        .filter((el) => el.getAttribute("data-variant") === "completed");
      expect(verifiedBadges.length).toBeGreaterThanOrEqual(1);
      const unverified = screen.getAllByText("Unverified");
      expect(unverified.length).toBeGreaterThan(0);
      expect(unverified[0]).toHaveAttribute("data-variant", "pending");
    });

    it("renders credit values", () => {
      mockUseQueryReturn({ data: { users: mockUsers, total: 2 } });
      renderPage();
      expect(screen.getAllByText("100").length).toBeGreaterThan(0);
      expect(screen.getAllByText("10").length).toBeGreaterThan(0);
    });

    it("renders scan counts", () => {
      mockUseQueryReturn({ data: { users: mockUsers, total: 2 } });
      renderPage();
      expect(screen.getAllByText("42").length).toBeGreaterThan(0);
      expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    });

    it("sets title tooltip on email cells", () => {
      mockUseQueryReturn({ data: { users: mockUsers, total: 2 } });
      renderPage();
      const titled = screen
        .getAllByText("admin@test.com")
        .find((el) => el.getAttribute("title") === "admin@test.com");
      expect(titled).toBeTruthy();
    });

    it("navigates to user detail on View click", async () => {
      mockUseQueryReturn({ data: { users: mockUsers, total: 2 } });
      renderPage();
      const viewButtons = screen.getAllByText("View");
      expect(viewButtons.length).toBe(2);
      await userEvent.click(viewButtons[0]);
      expect(mockNavigate).toHaveBeenCalledWith("/admin/users/1");
    });
  });

  describe("pagination", () => {
    it("shows pagination when multiple pages", () => {
      const manyUsers = Array.from({ length: 20 }, (_, i) => ({
        id: String(i),
        email: `user${i}@test.com`,
        is_admin: false,
        is_verified: true,
        credits: 10,
        scan_count: 1,
        created_at: "2025-01-01T00:00:00Z",
      }));
      mockUseQueryReturn({ data: { users: manyUsers, total: 25 } });
      renderPage();
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    });

    it("does not show pagination when only one page", () => {
      const fewUsers = Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        email: `user${i}@test.com`,
        is_admin: false,
        is_verified: true,
        credits: 10,
        scan_count: 1,
        created_at: "2025-01-01T00:00:00Z",
      }));
      mockUseQueryReturn({ data: { users: fewUsers, total: 5 } });
      renderPage();
      expect(screen.queryByText(/Page/)).not.toBeInTheDocument();
    });

    it("does not show pagination while loading", () => {
      mockUseQueryReturn({ isLoading: true, data: undefined });
      renderPage();
      expect(screen.queryByText(/Page/)).not.toBeInTheDocument();
    });
  });
});
