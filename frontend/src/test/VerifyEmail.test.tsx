import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import VerifyEmail from "@/pages/VerifyEmail";
import { useAuthStore } from "@/store/authStore";

let mockVerifyEmail: ReturnType<typeof vi.fn>;
let mockResendVerification: ReturnType<typeof vi.fn>;
let mockNavigate: ReturnType<typeof vi.fn>;
let mockStartCooldown: ReturnType<typeof vi.fn>;
let mockCooldown: number;
let searchParams: URLSearchParams;

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      verifyEmail: mockVerifyEmail,
      resendVerification: mockResendVerification,
      isLoading: false,
      error: null as string | null,
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

const mockUseAuthStore = useAuthStore as unknown as ReturnType<typeof vi.fn>;

vi.mock("react-router-dom", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: vi.fn(() => mockNavigate),
  useSearchParams: vi.fn(() => [searchParams, vi.fn()]),
}));

describe("VerifyEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyEmail = vi.fn().mockResolvedValue(true);
    mockResendVerification = vi.fn().mockResolvedValue(true);
    mockNavigate = vi.fn();
    mockStartCooldown = vi.fn();
    mockCooldown = 0;
    searchParams = new URLSearchParams();
  });

  describe("no token", () => {
    it("renders Check your email heading", () => {
      render(<VerifyEmail />);
      expect(
        screen.getByRole("heading", { name: /check your email/i }),
      ).toBeInTheDocument();
    });

    it("renders VULNSCAN branding", () => {
      render(<VerifyEmail />);
      expect(screen.getByText(/VULN/)).toBeInTheDocument();
      expect(screen.getByText(/SCAN/)).toBeInTheDocument();
    });

    it("renders Back to sign in secondary link", () => {
      render(<VerifyEmail />);
      expect(
        screen.getByRole("link", { name: /back to sign in/i }),
      ).toBeInTheDocument();
    });

    it("renders resend email form with labeled input and button", () => {
      render(<VerifyEmail />);
      expect(screen.getByLabelText("Email")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Resend Verification Email" }),
      ).toBeInTheDocument();
    });

    it("shows resend success message after successful resend", async () => {
      render(<VerifyEmail />);
      const input = screen.getByPlaceholderText("you@example.com");
      fireEvent.change(input, { target: { value: "user@example.com" } });

      fireEvent.click(
        screen.getByRole("button", { name: "Resend Verification Email" }),
      );

      await waitFor(() => {
        expect(
          screen.getByText("Verification email resent! Please check your inbox."),
        ).toBeInTheDocument();
      });
    });

    it("shows error message when error is set", () => {
      mockUseAuthStore.mockImplementation(
        (selector?: (s: unknown) => unknown) => {
          const state = {
            verifyEmail: mockVerifyEmail,
            resendVerification: mockResendVerification,
            isLoading: false,
            error: "Rate limited",
          };
          if (selector) return selector(state);
          return state;
        },
      );

      render(<VerifyEmail />);
      expect(screen.getByText("Rate limited")).toBeInTheDocument();
    });

    it("shows cooldown timer when cooldown > 0", () => {
      mockCooldown = 15;
      render(<VerifyEmail />);
      expect(screen.getByText(/Too many attempts. Wait 15s/)).toBeInTheDocument();
    });

    it("calls resendVerification on form submit", async () => {
      render(<VerifyEmail />);
      const input = screen.getByPlaceholderText("you@example.com");
      fireEvent.change(input, { target: { value: "user@example.com" } });

      fireEvent.click(
        screen.getByRole("button", { name: "Resend Verification Email" }),
      );

      await waitFor(() => {
        expect(mockResendVerification).toHaveBeenCalledWith("user@example.com");
      });
    });

    it("shows loading state when resending", async () => {
      mockResendVerification = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(true), 100)),
      );
      render(<VerifyEmail />);
      const input = screen.getByPlaceholderText("you@example.com");
      fireEvent.change(input, { target: { value: "user@example.com" } });

      fireEvent.click(
        screen.getByRole("button", { name: "Resend Verification Email" }),
      );

      await waitFor(() => {
        expect(screen.getByText("Sending...")).toBeInTheDocument();
      });
    });
  });

  describe("with token", () => {
    beforeEach(() => {
      searchParams = new URLSearchParams({ token: "valid-token" });
    });

    it("renders Verifying email heading", () => {
      render(<VerifyEmail />);
      expect(
        screen.getByRole("heading", { name: /verifying email/i }),
      ).toBeInTheDocument();
    });

    it("shows loading spinner when isLoading is true", () => {
      mockUseAuthStore.mockImplementation(
        (selector?: (s: unknown) => unknown) => {
          const state = {
            verifyEmail: mockVerifyEmail,
            resendVerification: mockResendVerification,
            isLoading: true,
            error: null as string | null,
          };
          if (selector) return selector(state);
          return state;
        },
      );

      render(<VerifyEmail />);
      expect(screen.getByText("Verifying...")).toBeInTheDocument();
    });

    it("shows success state after successful verification", async () => {
      render(<VerifyEmail />);

      await waitFor(() => {
        expect(
          screen.getByText("Email verified successfully!"),
        ).toBeInTheDocument();
      });
    });

    it("shows Go to dashboard button on success", async () => {
      render(<VerifyEmail />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /go to dashboard/i }),
        ).toBeInTheDocument();
      });
    });

    it("navigates to dashboard when Go to dashboard is clicked", async () => {
      render(<VerifyEmail />);

      await waitFor(() => {
        fireEvent.click(screen.getByRole("button", { name: /go to dashboard/i }));
      });

      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });

    it("shows error state when verification fails", async () => {
      mockVerifyEmail = vi.fn().mockResolvedValue(false);
      render(<VerifyEmail />);

      await waitFor(() => {
        expect(
          screen.getByText("Verification failed. Please try again."),
        ).toBeInTheDocument();
      });
    });

    it("shows Back to sign in link on error", async () => {
      mockVerifyEmail = vi.fn().mockResolvedValue(false);
      render(<VerifyEmail />);

      await waitFor(() => {
        expect(
          screen.getByRole("link", { name: /back to sign in/i }),
        ).toBeInTheDocument();
      });
    });

    it("calls verifyEmail on mount with token", async () => {
      render(<VerifyEmail />);

      await waitFor(() => {
        expect(mockVerifyEmail).toHaveBeenCalledWith("valid-token");
      });
    });
  });
});
