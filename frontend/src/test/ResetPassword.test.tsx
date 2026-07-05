import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ResetPassword from "@/pages/ResetPassword";
import { useAuthStore } from "@/store/authStore";

let mockResetPassword: ReturnType<typeof vi.fn>;
let mockClearError: ReturnType<typeof vi.fn>;
let mockStartCooldown: ReturnType<typeof vi.fn>;
let mockCooldown: number;
let searchParams: URLSearchParams;

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      resetPassword: mockResetPassword,
      error: null as string | null,
      clearError: mockClearError,
    };
    if (selector) return selector(state);
    return state;
  }),
}));

vi.mock("@/hooks/useRateLimitCooldown", () => ({
  useRateLimitCooldown: vi.fn(() => ({
    cooldown: mockCooldown,
    startCooldown: mockStartCooldown,
  })),
}));

const mockUseAuthStore = useAuthStore as ReturnType<typeof vi.fn>;

vi.mock("react-router-dom", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useSearchParams: vi.fn(() => [searchParams, vi.fn()]),
}));

describe("ResetPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResetPassword = vi.fn().mockResolvedValue(true);
    mockClearError = vi.fn();
    mockStartCooldown = vi.fn();
    mockCooldown = 0;
    searchParams = new URLSearchParams({ token: "valid-token" });
  });

  describe("no token", () => {
    beforeEach(() => {
      searchParams = new URLSearchParams();
    });

    it("renders Invalid Reset Link heading", () => {
      render(<ResetPassword />);
      expect(
        screen.getByRole("heading", { name: "Invalid Reset Link" }),
      ).toBeInTheDocument();
    });

    it("renders error description text", () => {
      render(<ResetPassword />);
      expect(
        screen.getByText(/This password reset link is invalid or missing a token/),
      ).toBeInTheDocument();
    });

    it("renders Back to Sign In link", () => {
      render(<ResetPassword />);
      expect(screen.getByRole("link", { name: "Back to Sign In" })).toHaveAttribute(
        "href",
        "/login",
      );
    });
  });

  describe("with token", () => {
    it("renders Set New Password heading", () => {
      render(<ResetPassword />);
      expect(
        screen.getByRole("heading", { name: "Set New Password" }),
      ).toBeInTheDocument();
    });

    it("renders password and confirm password inputs", () => {
      render(<ResetPassword />);
      const inputs = screen.getAllByPlaceholderText(/^••••••••$/);
      expect(inputs).toHaveLength(2);
      expect(inputs[0]).toBeInTheDocument();
      expect(inputs[1]).toBeInTheDocument();
    });

    it("renders Reset Password button", () => {
      render(<ResetPassword />);
      expect(
        screen.getByRole("button", { name: "Reset Password" }),
      ).toBeInTheDocument();
    });

    it("shows validation error when password is too short", async () => {
      render(<ResetPassword />);
      const inputs = screen.getAllByPlaceholderText(/^••••••••$/);
      fireEvent.change(inputs[0], { target: { value: "short" } });
      fireEvent.change(inputs[1], { target: { value: "short" } });

      fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

      await waitFor(() => {
        expect(
          screen.getByText("Password must be at least 8 characters"),
        ).toBeInTheDocument();
      });
      expect(mockResetPassword).not.toHaveBeenCalled();
    });

    it("shows validation error when passwords do not match", async () => {
      render(<ResetPassword />);
      const inputs = screen.getAllByPlaceholderText(/^••••••••$/);
      fireEvent.change(inputs[0], { target: { value: "password123" } });
      fireEvent.change(inputs[1], { target: { value: "different456" } });

      fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

      await waitFor(() => {
        expect(
          screen.getByText("Passwords do not match"),
        ).toBeInTheDocument();
      });
      expect(mockResetPassword).not.toHaveBeenCalled();
    });

    it("shows store error message", () => {
      mockUseAuthStore.mockImplementation(
        (selector?: (s: unknown) => unknown) => {
          const state = {
            resetPassword: mockResetPassword,
            error: "Token expired",
            clearError: mockClearError,
          };
          if (selector) return selector(state);
          return state;
        },
      );

      render(<ResetPassword />);
      expect(screen.getByText("Token expired")).toBeInTheDocument();
    });

    it("shows cooldown timer when cooldown > 0", () => {
      mockCooldown = 45;
      render(<ResetPassword />);
      expect(screen.getByText(/Too many attempts. Wait 45s/)).toBeInTheDocument();
    });

    it("shows success state after successful submit", async () => {
      render(<ResetPassword />);
      const inputs = screen.getAllByPlaceholderText(/^••••••••$/);
      fireEvent.change(inputs[0], { target: { value: "newpassword123" } });
      fireEvent.change(inputs[1], { target: { value: "newpassword123" } });

      fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Password Reset Successful!" }),
        ).toBeInTheDocument();
      });
    });

    it("success state has Sign In link to /login", async () => {
      render(<ResetPassword />);
      const inputs = screen.getAllByPlaceholderText(/^••••••••$/);
      fireEvent.change(inputs[0], { target: { value: "newpassword123" } });
      fireEvent.change(inputs[1], { target: { value: "newpassword123" } });

      fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

      await waitFor(() => {
        expect(screen.getByRole("link", { name: "Sign In" })).toHaveAttribute(
          "href",
          "/login",
        );
      });
    });

    it("calls resetPassword on form submit", async () => {
      render(<ResetPassword />);
      const inputs = screen.getAllByPlaceholderText(/^••••••••$/);
      fireEvent.change(inputs[0], { target: { value: "newpassword123" } });
      fireEvent.change(inputs[1], { target: { value: "newpassword123" } });

      fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

      await waitFor(() => {
        expect(mockResetPassword).toHaveBeenCalledWith(
          "valid-token",
          "newpassword123",
          "newpassword123",
        );
      });
    });

    it("shows loading state when submitting", async () => {
      mockResetPassword = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(true), 100)),
      );
      render(<ResetPassword />);
      const inputs = screen.getAllByPlaceholderText(/^••••••••$/);
      fireEvent.change(inputs[0], { target: { value: "newpassword123" } });
      fireEvent.change(inputs[1], { target: { value: "newpassword123" } });

      fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

      await waitFor(() => {
        expect(screen.getByText("Resetting password...")).toBeInTheDocument();
      });
    });

    it("renders Back to sign in link at bottom", () => {
      render(<ResetPassword />);
      expect(
        screen.getByRole("link", { name: /back to sign in/i }),
      ).toBeInTheDocument();
    });

    it("calls clearError on unmount", () => {
      const { unmount } = render(<ResetPassword />);
      unmount();
      expect(mockClearError).toHaveBeenCalled();
    });
  });
});
