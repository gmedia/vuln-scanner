import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Register from "@/pages/Register";
import { useAuthStore } from "@/store/authStore";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(() => mockNavigate),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

const okRegister = {
  ok: true as const,
  emailSent: true as boolean | null,
  message: "Registrasi berhasil. Periksa email Anda untuk verifikasi.",
};

const defaultAuthState = {
  register: vi.fn().mockResolvedValue(okRegister),
  resendVerification: vi.fn().mockResolvedValue({
    ok: true,
    emailSent: true,
    message: "Email verifikasi telah dikirim.",
  }),
  error: null as string | null,
  isAuthenticated: false,
  isLoading: false,
  clearError: vi.fn(),
  user: null,
};

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(() => defaultAuthState),
}));

vi.mock("@/components/auth/GoogleSignInButton", () => ({
  default: () => null,
}));

vi.mock("@/store/creditStore", () => ({
  useCreditStore: vi.fn(() => ({
    credits: 100,
    isAdmin: false,
    isLoading: false,
  })),
}));

const mockUseAuthStore = useAuthStore as unknown as ReturnType<typeof vi.fn>;

async function submitValidRegistration() {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "test@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "password123" },
  });
  fireEvent.change(screen.getByLabelText("Confirm Password"), {
    target: { value: "password123" },
  });
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));
}

describe("Register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthStore.mockReturnValue(defaultAuthState);
    defaultAuthState.register = vi.fn().mockResolvedValue(okRegister);
    defaultAuthState.resendVerification = vi.fn().mockResolvedValue({
      ok: true,
      emailSent: true,
      message: "Email verifikasi telah dikirim.",
    });
    defaultAuthState.error = null;
    defaultAuthState.isAuthenticated = false;
    defaultAuthState.clearError = vi.fn();
  });

  it("renders the registration form with email input", () => {
    render(<Register />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
  });

  it("renders the password input", () => {
    render(<Register />);
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    const passwordInput = screen.getByLabelText("Password");
    expect(passwordInput).toHaveAttribute("type", "password");
    expect(passwordInput).toHaveAttribute("placeholder", "••••••••");
  });

  it("renders the confirm password input", () => {
    render(<Register />);
    expect(screen.getByLabelText("Confirm Password")).toBeInTheDocument();
    const confirmInput = screen.getAllByPlaceholderText("••••••••")[1];
    expect(confirmInput).toHaveAttribute("type", "password");
  });

  it("renders the submit button", () => {
    render(<Register />);
    const button = screen.getByRole("button", { name: /create account/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it("renders the Crosshair icon and Create account title", () => {
    render(<Register />);
    expect(
      screen.getByRole("heading", { name: /create account/i }),
    ).toBeInTheDocument();
  });

  it("renders Sign in link", () => {
    render(<Register />);
    const signInLink = screen.getByText("Already have an account?");
    expect(signInLink).toBeInTheDocument();
    const link = signInLink.parentElement?.querySelector("a");
    expect(link).toHaveAttribute("href", "/login");
  });

  it("shows validation error when password is less than 8 characters", async () => {
    render(<Register />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "short" },
    });
    fireEvent.change(screen.getByLabelText("Confirm Password"), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => {
      expect(
        screen.getByText("Password must be at least 8 characters"),
      ).toBeInTheDocument();
    });
    expect(defaultAuthState.register).not.toHaveBeenCalled();
  });

  it("shows validation error when passwords do not match", async () => {
    render(<Register />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm Password"), {
      target: { value: "different" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => {
      expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    });
    expect(defaultAuthState.register).not.toHaveBeenCalled();
  });

  it("shows server error from authStore", () => {
    mockUseAuthStore.mockReturnValue({
      ...defaultAuthState,
      error: "Server error",
    });
    render(<Register />);
    expect(screen.getByText("Server error")).toBeInTheDocument();
  });

  it("calls register with email, password, confirmPassword on valid submit", async () => {
    render(<Register />);
    await submitValidRegistration();
    await waitFor(() => {
      expect(defaultAuthState.register).toHaveBeenCalledWith(
        "test@example.com",
        "password123",
        "password123",
      );
    });
  });

  it("shows success view after successful registration", async () => {
    render(<Register />);
    await submitValidRegistration();
    await waitFor(() => {
      expect(screen.getByText("Registration Successful!")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "Registrasi berhasil. Periksa email Anda untuk verifikasi.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /resend verification email/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Go to Sign In")).toBeInTheDocument();
  });

  it("shows send-failed warning and resend on email_sent false", async () => {
    defaultAuthState.register = vi.fn().mockResolvedValue({
      ok: true,
      emailSent: false,
      message:
        "Registrasi berhasil, tetapi email verifikasi gagal dikirim. Silakan gunakan kirim ulang verifikasi.",
    });
    render(<Register />);
    await submitValidRegistration();
    await waitFor(() => {
      expect(screen.getByText("Registration Successful!")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/email verifikasi gagal dikirim/i),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /resend verification email/i }),
    );
    await waitFor(() => {
      expect(defaultAuthState.resendVerification).toHaveBeenCalledWith(
        "test@example.com",
      );
    });
    await waitFor(() => {
      const feedback = screen.getAllByText("Email verifikasi telah dikirim.");
      expect(feedback.length).toBeGreaterThanOrEqual(1);
      expect(feedback.some((el) => el.className.includes("text-primary"))).toBe(
        true,
      );
    });
  });

  it("shows Go to Sign In link on success page", async () => {
    render(<Register />);
    await submitValidRegistration();
    await waitFor(() => {
      expect(screen.getByText("Registration Successful!")).toBeInTheDocument();
    });
    const goToSignIn = screen.getByText("Go to Sign In");
    expect(goToSignIn.closest("a")).toHaveAttribute("href", "/login");
  });

  it("shows loading state when submitting", async () => {
    defaultAuthState.register = vi.fn(
      () =>
        new Promise((resolve) => setTimeout(() => resolve(okRegister), 100)),
    );
    render(<Register />);
    await submitValidRegistration();
    await waitFor(() => {
      expect(screen.getByText("Creating account...")).toBeInTheDocument();
    });
  });

  it("disables inputs when submitting", async () => {
    defaultAuthState.register = vi.fn(
      () =>
        new Promise((resolve) => setTimeout(() => resolve(okRegister), 100)),
    );
    render(<Register />);
    await submitValidRegistration();
    await waitFor(() => {
      expect(screen.getByLabelText("Email")).toBeDisabled();
      expect(screen.getByLabelText("Password")).toBeDisabled();
      expect(screen.getByLabelText("Confirm Password")).toBeDisabled();
    });
  });

  it("disables button when submitting", async () => {
    defaultAuthState.register = vi.fn(
      () =>
        new Promise((resolve) => setTimeout(() => resolve(okRegister), 100)),
    );
    render(<Register />);
    await submitValidRegistration();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /creating account/i }),
      ).toBeDisabled();
    });
  });

  it("redirects to /dashboard when isAuthenticated becomes true", () => {
    mockUseAuthStore.mockReturnValue({
      ...defaultAuthState,
      isAuthenticated: true,
    });
    render(<Register />);
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("calls clearError on component unmount", () => {
    const { unmount } = render(<Register />);
    unmount();
    expect(defaultAuthState.clearError).toHaveBeenCalled();
  });
});
