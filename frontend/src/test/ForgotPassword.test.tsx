import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ForgotPassword from "@/pages/ForgotPassword";
import { useAuthStore } from "@/store/authStore";

let mockForgotPassword: ReturnType<typeof vi.fn>;
let mockClearError: ReturnType<typeof vi.fn>;
let mockStartCooldown: ReturnType<typeof vi.fn>;
let mockCooldown: number;

vi.mock("react-router-dom", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      forgotPassword: mockForgotPassword,
      error: null as string | null,
      clearError: mockClearError,
    };
    if (selector) return selector(state);
    return state;
  }),
}));

const mockUseAuthStore = useAuthStore as unknown as ReturnType<typeof vi.fn>;

vi.mock("@/hooks/useRateLimitCooldown", () => ({
  useRateLimitCooldown: vi.fn(() => ({
    cooldown: mockCooldown,
    startCooldown: mockStartCooldown,
  })),
}));

describe("ForgotPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockForgotPassword = vi.fn().mockResolvedValue(true);
    mockClearError = vi.fn();
    mockStartCooldown = vi.fn();
    mockCooldown = 0;
  });

  it("renders the Reset Password heading", () => {
    render(<ForgotPassword />);
    expect(
      screen.getByRole("heading", { name: "Reset Password" }),
    ).toBeInTheDocument();
  });

  it("renders email input with correct placeholder", () => {
    render(<ForgotPassword />);
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
  });

  it("renders Send Reset Link button", () => {
    render(<ForgotPassword />);
    expect(screen.getByRole("button", { name: "Send Reset Link" })).toBeInTheDocument();
  });

  it("renders Back to sign in link pointing to /login", () => {
    render(<ForgotPassword />);
    const link = screen.getByRole("link", { name: /back to sign in/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/login");
  });

  it("shows error message when error is set", () => {
    mockUseAuthStore.mockImplementation(
      (selector?: (s: unknown) => unknown) => {
        const state = {
          forgotPassword: mockForgotPassword,
          error: "User not found",
          clearError: mockClearError,
        };
        if (selector) return selector(state);
        return state;
      },
    );

    render(<ForgotPassword />);
    expect(screen.getByText("User not found")).toBeInTheDocument();
  });

  it("shows cooldown timer when cooldown > 0", () => {
    mockCooldown = 30;
    render(<ForgotPassword />);
    expect(screen.getByText(/Too many attempts. Wait 30s/)).toBeInTheDocument();
  });

  it("shows success state after successful submit", async () => {
    render(<ForgotPassword />);
    const emailInput = screen.getByPlaceholderText("you@example.com");
    fireEvent.change(emailInput, { target: { value: "user@example.com" } });

    fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));

    await waitFor(() => {
      expect(screen.getByText("Check Your Email")).toBeInTheDocument();
    });
  });

  it("success state has Back to Sign In link", async () => {
    render(<ForgotPassword />);
    const emailInput = screen.getByPlaceholderText("you@example.com");
    fireEvent.change(emailInput, { target: { value: "user@example.com" } });

    fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));

    await waitFor(() => {
      const links = screen.getAllByRole("link", { name: /back to sign in/i });
      expect(links.length).toBeGreaterThan(0);
    });
  });

  it("shows loading state when submitting", async () => {
    mockForgotPassword = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(true), 100)),
    );
    render(<ForgotPassword />);
    const emailInput = screen.getByPlaceholderText("you@example.com");
    fireEvent.change(emailInput, { target: { value: "user@example.com" } });

    fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));

    await waitFor(() => {
      expect(screen.getByText("Sending reset link...")).toBeInTheDocument();
    });
  });

  it("calls forgotPassword on form submit", async () => {
    render(<ForgotPassword />);
    const emailInput = screen.getByPlaceholderText("you@example.com");
    fireEvent.change(emailInput, { target: { value: "user@example.com" } });

    fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));

    await waitFor(() => {
      expect(mockForgotPassword).toHaveBeenCalledWith("user@example.com");
    });
  });

  it("disables button and input while submitting", async () => {
    mockForgotPassword = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(true), 100)),
    );
    render(<ForgotPassword />);
    const emailInput = screen.getByPlaceholderText("you@example.com");
    fireEvent.change(emailInput, { target: { value: "user@example.com" } });

    fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));

    await waitFor(() => {
      expect(emailInput).toBeDisabled();
    });
  });

  it("calls clearError on unmount", () => {
    const { unmount } = render(<ForgotPassword />);
    unmount();
    expect(mockClearError).toHaveBeenCalled();
  });
});
