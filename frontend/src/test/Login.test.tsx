import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Login from "@/pages/Login";
import { useAuthStore } from "@/store/authStore";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(() => mockNavigate),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

const defaultAuthState = {
  login: vi.fn().mockResolvedValue(true),
  error: null as string | null,
  isAuthenticated: false,
  isLoading: false,
  clearError: vi.fn(),
  user: null,
};

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(() => defaultAuthState),
}));

vi.mock("@/store/creditStore", () => ({
  useCreditStore: vi.fn(() => ({
    credits: 100,
    isAdmin: false,
    isLoading: false,
  })),
}));

const mockUseAuthStore = useAuthStore as unknown as ReturnType<typeof vi.fn>;

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthStore.mockReturnValue(defaultAuthState);
    defaultAuthState.login = vi.fn().mockResolvedValue(true);
    defaultAuthState.error = null;
    defaultAuthState.isAuthenticated = false;
    defaultAuthState.clearError = vi.fn();
  });

  it("renders the Sign In form with email input", () => {
    render(<Login />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
  });

  it("renders the password input", () => {
    render(<Login />);
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    const passwordInput = screen.getByPlaceholderText("••••••••");
    expect(passwordInput).toBeInTheDocument();
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("renders the submit button", () => {
    render(<Login />);
    const button = screen.getByRole("button", { name: /sign in/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it("renders the Crosshair icon and Sign in title", () => {
    render(<Login />);
    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
  });

  it("toggles password visibility", () => {
    render(<Login />);
    const passwordInput = screen.getByLabelText("Password");
    expect(passwordInput).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: /show password/i }));
    expect(passwordInput).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: /hide password/i }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("renders Forgot password? link", () => {
    render(<Login />);
    const forgotLink = screen.getByText("Forgot password?");
    expect(forgotLink).toBeInTheDocument();
    expect(forgotLink.closest("a")).toHaveAttribute("href", "/forgot-password");
  });

  it("renders Register link", () => {
    render(<Login />);
    const registerLink = screen.getByText("Register");
    expect(registerLink).toBeInTheDocument();
    expect(registerLink.closest("a")).toHaveAttribute("href", "/register");
  });

  it("shows error message when authStore has error", () => {
    mockUseAuthStore.mockReturnValue({
      ...defaultAuthState,
      error: "Invalid credentials",
    });
    render(<Login />);
    expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
  });

  it("does not show error message when no error", () => {
    render(<Login />);
    expect(screen.queryByText("Invalid credentials")).not.toBeInTheDocument();
  });

  it("calls login on form submit with email and password values", async () => {
    render(<Login />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(defaultAuthState.login).toHaveBeenCalledWith(
        "test@example.com",
        "password123",
      );
    });
  });

  it("redirects to /dashboard on successful login", async () => {
    render(<Login />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("does not redirect after failed login", async () => {
    defaultAuthState.login = vi.fn().mockResolvedValue(false);
    render(<Login />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(defaultAuthState.login).toHaveBeenCalled();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows loading state when submitting", async () => {
    defaultAuthState.login = vi.fn(
      () => new Promise((resolve) => setTimeout(() => resolve(true), 100)),
    );
    render(<Login />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText("Signing in...")).toBeInTheDocument();
    });
  });

  it("disables inputs when submitting", async () => {
    defaultAuthState.login = vi.fn(
      () => new Promise((resolve) => setTimeout(() => resolve(true), 100)),
    );
    render(<Login />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("Email")).toBeDisabled();
      expect(screen.getByLabelText("Password")).toBeDisabled();
    });
  });

  it("disables button when submitting", async () => {
    defaultAuthState.login = vi.fn(
      () => new Promise((resolve) => setTimeout(() => resolve(true), 100)),
    );
    render(<Login />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
    });
  });

  it("redirects to /dashboard when isAuthenticated becomes true", () => {
    mockUseAuthStore.mockReturnValue({
      ...defaultAuthState,
      isAuthenticated: true,
    });
    render(<Login />);
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("calls clearError on component unmount", () => {
    const { unmount } = render(<Login />);
    unmount();
    expect(defaultAuthState.clearError).toHaveBeenCalled();
  });

  it("handles empty form submission gracefully", async () => {
    render(<Login />);
    const form = screen.getByRole("button", { name: /sign in/i }).closest("form")!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(defaultAuthState.login).toHaveBeenCalledWith("", "");
    });
  });
});
