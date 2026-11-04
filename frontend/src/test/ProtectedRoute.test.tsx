import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";

const { mockLocation } = vi.hoisted(() => ({
  mockLocation: { pathname: "/settings/workspace", search: "" },
}));

const defaultAuthState = {
  isLoading: true,
  isAuthenticated: false,
  initialize: vi.fn(),
  user: null,
  error: null,
};

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(() => defaultAuthState),
}));

vi.mock("react-router-dom", () => ({
  Navigate: ({ to }: { to: string }) => (
    <div data-testid="navigate" data-to={to} />
  ),
  Outlet: () => <div data-testid="outlet">Outlet content</div>,
  useLocation: () => mockLocation,
}));

vi.mock("lucide-react", () => ({
  Loader2: ({ className }: { className: string }) => (
    <div data-testid="loader" className={className} />
  ),
}));

const mockUseAuthStore = useAuthStore as unknown as ReturnType<typeof vi.fn>;

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthStore.mockReturnValue(defaultAuthState);
    mockLocation.pathname = "/settings/workspace";
    mockLocation.search = "";
  });

  it("shows loading spinner when isLoading is true", () => {
    mockUseAuthStore.mockReturnValue({
      ...defaultAuthState,
      isLoading: true,
    });
    render(<ProtectedRoute />);
    expect(screen.getByTestId("loader")).toBeInTheDocument();
  });

  it("redirects to /login when not authenticated", () => {
    mockUseAuthStore.mockReturnValue({
      ...defaultAuthState,
      isLoading: false,
      isAuthenticated: false,
    });
    render(<ProtectedRoute />);
    const navigate = screen.getByTestId("navigate");
    expect(navigate).toBeInTheDocument();
    expect(navigate).toHaveAttribute(
      "data-to",
      `/login?next=${encodeURIComponent("/settings/workspace")}`,
    );
  });

  it("preserves the attempted path and query in next", () => {
    mockLocation.pathname = "/pay/inv-1";
    mockLocation.search = "?status=finish";
    mockUseAuthStore.mockReturnValue({
      ...defaultAuthState,
      isLoading: false,
      isAuthenticated: false,
    });
    render(<ProtectedRoute />);
    expect(screen.getByTestId("navigate")).toHaveAttribute(
      "data-to",
      `/login?next=${encodeURIComponent("/pay/inv-1?status=finish")}`,
    );
  });

  it("renders Outlet when authenticated", () => {
    mockUseAuthStore.mockReturnValue({
      ...defaultAuthState,
      isLoading: false,
      isAuthenticated: true,
    });
    render(<ProtectedRoute />);
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
    expect(screen.queryByTestId("navigate")).not.toBeInTheDocument();
  });

  it("calls initialize on mount", () => {
    const mockInitialize = vi.fn();
    mockUseAuthStore.mockReturnValue({
      ...defaultAuthState,
      isLoading: false,
      isAuthenticated: true,
      initialize: mockInitialize,
    });
    render(<ProtectedRoute />);
    expect(mockInitialize).toHaveBeenCalled();
  });
});
