import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Profile from "@/pages/Profile";
import { useAuthStore } from "@/store/authStore";

let mockUpdateProfile: ReturnType<typeof vi.fn>;
let mockChangePassword: ReturnType<typeof vi.fn>;
let mockProfileStartCooldown: ReturnType<typeof vi.fn>;
let mockPasswordStartCooldown: ReturnType<typeof vi.fn>;
let profileCooldownValue: number;
let passwordCooldownValue: number;
let callCount: number;
let mockError: string | null;
let mockUser: {
  id: string;
  email: string;
  is_verified: boolean;
  is_admin: boolean;
  credits: number;
};

vi.mock("@/hooks/useRateLimitCooldown", () => ({
  useRateLimitCooldown: vi.fn(() => {
    callCount++;
    if (callCount === 1) {
      return { cooldown: profileCooldownValue, startCooldown: mockProfileStartCooldown };
    }
    return { cooldown: passwordCooldownValue, startCooldown: mockPasswordStartCooldown };
  }),
}));

vi.mock("@/store/authStore", () => {
  const mockFn = vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      user: mockUser,
      updateProfile: mockUpdateProfile,
      changePassword: mockChangePassword,
      error: mockError,
    };
    if (selector) return selector(state);
    return state;
  });
  (mockFn as ReturnType<typeof vi.fn> & { getState: () => Record<string, unknown> }).getState = () => ({
    user: mockUser,
    updateProfile: mockUpdateProfile,
    changePassword: mockChangePassword,
    error: mockError,
  });
  return { useAuthStore: mockFn };
});

const mockUseAuthStore = useAuthStore as unknown as ReturnType<typeof vi.fn>;

describe("Profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callCount = 0;
    mockError = null;
    mockUser = {
      id: "u1",
      email: "user@example.com",
      is_verified: true,
      is_admin: false,
      credits: 10,
    };
    mockUpdateProfile = vi.fn().mockResolvedValue(true);
    mockChangePassword = vi.fn().mockResolvedValue(true);
    mockProfileStartCooldown = vi.fn();
    mockPasswordStartCooldown = vi.fn();
    profileCooldownValue = 0;
    passwordCooldownValue = 0;
  });

  describe("rendering", () => {
    it("renders Profile heading", () => {
      render(<Profile />);
      expect(
        screen.getByRole("heading", { name: "Profile" }),
      ).toBeInTheDocument();
    });

    it("displays current email", () => {
      render(<Profile />);
      expect(screen.getByText("user@example.com")).toBeInTheDocument();
    });

    it("starts New email field empty (not prefilled)", () => {
      render(<Profile />);
      const emailInput = screen.getByPlaceholderText("new@example.com");
      expect(emailInput).toHaveValue("");
      expect(emailInput).not.toHaveValue("user@example.com");
    });

    it("shows password confirmation helper", () => {
      render(<Profile />);
      expect(screen.getByText("Password required to confirm")).toBeInTheDocument();
    });

    it("shows page subtitle", () => {
      render(<Profile />);
      expect(
        screen.getByText("Manage your account email and password"),
      ).toBeInTheDocument();
    });
  });

  describe("Update Email form", () => {
    it("renders New Email and Current Password inputs", () => {
      render(<Profile />);
      expect(screen.getByPlaceholderText("new@example.com")).toBeInTheDocument();
      const passwordInputs = screen.getAllByPlaceholderText("••••••••");
      expect(passwordInputs.length).toBeGreaterThanOrEqual(1);
    });

    it("has Update email button", () => {
      render(<Profile />);
      expect(
        screen.getByRole("button", { name: "Update email" }),
      ).toBeInTheDocument();
    });

    it("calls updateProfile on submit", async () => {
      render(<Profile />);
      fireEvent.change(screen.getByPlaceholderText("new@example.com"), {
        target: { value: "new@example.com" },
      });
      fireEvent.change(screen.getAllByPlaceholderText("••••••••")[0], {
        target: { value: "currentpass" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Update email" }));

      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalledWith(
          "new@example.com",
          "currentpass",
        );
      });
    });

    it("shows success message after successful update", async () => {
      render(<Profile />);
      fireEvent.change(screen.getByPlaceholderText("new@example.com"), {
        target: { value: "new@example.com" },
      });
      fireEvent.change(screen.getAllByPlaceholderText("••••••••")[0], {
        target: { value: "currentpass" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Update email" }));

      await waitFor(() => {
        expect(screen.getByText("Profile updated")).toBeInTheDocument();
      });
    });

    it("shows error message when error is set", () => {
      mockError = "Wrong password";

      render(<Profile />);
      expect(screen.getByText("Wrong password")).toBeInTheDocument();
    });

    it("shows cooldown timer when profileCooldown > 0", () => {
      profileCooldownValue = 20;
      render(<Profile />);
      expect(screen.getByText(/Too many attempts. Wait 20s/)).toBeInTheDocument();
    });

    it("shows loading state when updating", async () => {
      mockUpdateProfile = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(true), 100)),
      );
      render(<Profile />);
      fireEvent.change(screen.getByPlaceholderText("new@example.com"), {
        target: { value: "new@example.com" },
      });
      fireEvent.change(screen.getAllByPlaceholderText("••••••••")[0], {
        target: { value: "currentpass" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Update email" }));

      await waitFor(() => {
        expect(screen.getByText("Updating...")).toBeInTheDocument();
      });
    });
  });

  describe("Change Password form", () => {
    it("renders Current Password, New Password, Confirm New Password inputs", () => {
      render(<Profile />);
      expect(
        screen.getByRole("heading", { name: "Change password" }),
      ).toBeInTheDocument();
      expect(screen.getAllByPlaceholderText("••••••••")).toHaveLength(3);
      expect(
        screen.getByPlaceholderText("Min 8 chars, uppercase, lowercase, digit"),
      ).toBeInTheDocument();
    });

    it("has Change password button", () => {
      render(<Profile />);
      expect(
        screen.getByRole("button", { name: "Change password" }),
      ).toBeInTheDocument();
    });

    it("calls changePassword on submit", async () => {
      render(<Profile />);
      const passInputs = screen.getAllByPlaceholderText("••••••••");
      const newPassInput = screen.getByPlaceholderText(
        "Min 8 chars, uppercase, lowercase, digit",
      );
      fireEvent.change(passInputs[1], { target: { value: "current" } });
      fireEvent.change(newPassInput, { target: { value: "newpass123" } });
      fireEvent.change(passInputs[2], { target: { value: "newpass123" } });

      fireEvent.click(screen.getByRole("button", { name: "Change password" }));

      await waitFor(() => {
        expect(mockChangePassword).toHaveBeenCalledWith(
          "current",
          "newpass123",
          "newpass123",
        );
      });
    });

    it("shows success message after successful change", async () => {
      render(<Profile />);
      const passInputs = screen.getAllByPlaceholderText("••••••••");
      const newPassInput = screen.getByPlaceholderText(
        "Min 8 chars, uppercase, lowercase, digit",
      );
      fireEvent.change(passInputs[1], { target: { value: "current" } });
      fireEvent.change(newPassInput, { target: { value: "newpass123" } });
      fireEvent.change(passInputs[2], { target: { value: "newpass123" } });

      fireEvent.click(screen.getByRole("button", { name: "Change password" }));

      await waitFor(() => {
        expect(screen.getByText("Password changed")).toBeInTheDocument();
      });
    });

    it("shows passwordError message", async () => {
      mockChangePassword = vi.fn().mockResolvedValue(false);
      mockError = "Invalid current password";

      render(<Profile />);
      const passInputs = screen.getAllByPlaceholderText("••••••••");
      const newPassInput = screen.getByPlaceholderText(
        "Min 8 chars, uppercase, lowercase, digit",
      );
      fireEvent.change(passInputs[1], { target: { value: "wrong" } });
      fireEvent.change(newPassInput, { target: { value: "newpass123" } });
      fireEvent.change(passInputs[2], { target: { value: "newpass123" } });

      fireEvent.click(screen.getByRole("button", { name: "Change password" }));

      await waitFor(() => {
        expect(screen.getByText("Invalid current password")).toBeInTheDocument();
      });
    });

    it("shows cooldown timer when passwordCooldown > 0", () => {
      passwordCooldownValue = 60;
      render(<Profile />);
      expect(screen.getByText(/Too many attempts. Wait 60s/)).toBeInTheDocument();
    });

    it("shows loading state when changing password", async () => {
      mockChangePassword = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(true), 100)),
      );
      render(<Profile />);
      const passInputs = screen.getAllByPlaceholderText("••••••••");
      const newPassInput = screen.getByPlaceholderText(
        "Min 8 chars, uppercase, lowercase, digit",
      );
      fireEvent.change(passInputs[1], { target: { value: "current" } });
      fireEvent.change(newPassInput, { target: { value: "newpass123" } });
      fireEvent.change(passInputs[2], { target: { value: "newpass123" } });

      fireEvent.click(screen.getByRole("button", { name: "Change password" }));

      await waitFor(() => {
        expect(screen.getByText("Changing...")).toBeInTheDocument();
      });
    });
  });
});
