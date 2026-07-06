import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminRoute from "@/components/auth/AdminRoute";
import { useAuthStore } from "@/store/authStore";

const defaultAuthState = {
  user: null as { is_admin: boolean } | null,
  isAuthenticated: false,
  isLoading: false,
};

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn((selector?: (s: typeof defaultAuthState) => unknown) => {
    if (selector) return selector(defaultAuthState);
    return defaultAuthState;
  }),
}));

vi.mock("react-router-dom", () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
  Outlet: () => <div data-testid="outlet">Admin outlet content</div>,
}));

const mockUseAuthStore = useAuthStore as unknown as ReturnType<typeof vi.fn>;

describe("AdminRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /dashboard when user is null", () => {
    mockUseAuthStore.mockImplementation((selector?: (s: typeof defaultAuthState) => unknown) => {
      const state = { ...defaultAuthState, user: null };
      if (selector) return selector(state);
      return state;
    });
    render(<AdminRoute />);
    const navigate = screen.getByTestId("navigate");
    expect(navigate).toBeInTheDocument();
    expect(navigate).toHaveAttribute("data-to", "/dashboard");
  });

  it("redirects to /dashboard when user is not admin", () => {
    mockUseAuthStore.mockImplementation((selector?: (s: typeof defaultAuthState) => unknown) => {
      const state = { ...defaultAuthState, user: { is_admin: false } };
      if (selector) return selector(state);
      return state;
    });
    render(<AdminRoute />);
    const navigate = screen.getByTestId("navigate");
    expect(navigate).toBeInTheDocument();
    expect(navigate).toHaveAttribute("data-to", "/dashboard");
  });

  it("renders Outlet when user is admin", () => {
    mockUseAuthStore.mockImplementation((selector?: (s: typeof defaultAuthState) => unknown) => {
      const state = { ...defaultAuthState, user: { is_admin: true } };
      if (selector) return selector(state);
      return state;
    });
    render(<AdminRoute />);
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
    expect(screen.queryByTestId("navigate")).not.toBeInTheDocument();
  });
});
