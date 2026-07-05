import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";

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
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
  Outlet: () => <div data-testid="outlet">Outlet content</div>,
}));

vi.mock("lucide-react", () => ({
  Loader2: ({ className }: { className: string }) => (
    <div data-testid="loader" className={className} />
  ),
}));

const mockUseAuthStore = useAuthStore as ReturnType<typeof vi.fn>;

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthStore.mockReturnValue(defaultAuthState);
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
    expect(navigate).toHaveAttribute("data-to", "/login");
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
