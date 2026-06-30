import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuthStore } from "@/store/authStore";

vi.mock("@/api/auth", () => ({
  login: vi.fn(),
  register: vi.fn(),
  verifyEmail: vi.fn(),
  refreshToken: vi.fn(),
  getMe: vi.fn(),
  authApi: {
    defaults: {
      headers: {
        common: {} as Record<string, string>,
      },
    },
  },
}));

import * as authApi from "@/api/auth";

const mockedAuthApi = authApi as unknown as {
  login: ReturnType<typeof vi.fn>;
  register: ReturnType<typeof vi.fn>;
  verifyEmail: ReturnType<typeof vi.fn>;
  refreshToken: ReturnType<typeof vi.fn>;
  getMe: ReturnType<typeof vi.fn>;
  authApi: {
    defaults: {
      headers: {
        common: Record<string, string>;
      };
    };
  };
};

describe("authStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,
    });
  });

  describe("initial state", () => {
    it("has null user and not authenticated, isLoading true", () => {
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(true);
      expect(state.error).toBeNull();
    });
  });

  describe("setAccessToken", () => {
    it("sets accessToken and stores in localStorage", () => {
      useAuthStore.getState().setAccessToken("my-token");
      const state = useAuthStore.getState();
      expect(state.accessToken).toBe("my-token");
      expect(localStorage.getItem("accessToken")).toBe("my-token");
    });

    it("removes accessToken from state and localStorage when passed null", () => {
      localStorage.setItem("accessToken", "existing");
      useAuthStore.setState({ accessToken: "existing" });

      useAuthStore.getState().setAccessToken(null);
      const state = useAuthStore.getState();
      expect(state.accessToken).toBeNull();
      expect(localStorage.getItem("accessToken")).toBeNull();
    });
  });

  describe("setCredits", () => {
    it("updates credits on the user object", () => {
      useAuthStore.setState({
        user: {
          id: "u1",
          email: "a@b.com",
          is_verified: true,
          is_admin: false,
          credits: 10,
        },
      });

      useAuthStore.getState().setCredits(25);
      expect(useAuthStore.getState().user?.credits).toBe(25);
    });

    it("does nothing when user is null", () => {
      useAuthStore.getState().setCredits(50);
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  describe("login", () => {
    const mockLoginResponse = {
      access_token: "access-xyz",
      refresh_token: "refresh-xyz",
      token_type: "bearer",
      expires_in: 3600,
    };

    const mockUserResponse = {
      id: "user-1",
      email: "test@example.com",
      is_verified: true,
      created_at: "2025-01-01T00:00:00Z",
    };

    it("calls login API, then getMe, sets user and tokens", async () => {
      mockedAuthApi.login.mockResolvedValueOnce(mockLoginResponse);
      mockedAuthApi.getMe.mockResolvedValueOnce(mockUserResponse);

      const result = await useAuthStore.getState().login("test@example.com", "pass123");

      expect(mockedAuthApi.login).toHaveBeenCalledWith("test@example.com", "pass123");
      expect(mockedAuthApi.getMe).toHaveBeenCalled();
      expect(result).toBe(true);

      const state = useAuthStore.getState();
      expect(state.accessToken).toBe("access-xyz");
      expect(state.user?.id).toBe("user-1");
      expect(state.user?.email).toBe("test@example.com");
      expect(state.user?.is_verified).toBe(true);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(localStorage.getItem("accessToken")).toBe("access-xyz");
    });

    it("sets Authorization header after successful login", async () => {
      mockedAuthApi.login.mockResolvedValueOnce(mockLoginResponse);
      mockedAuthApi.getMe.mockResolvedValueOnce(mockUserResponse);

      await useAuthStore.getState().login("test@example.com", "pass123");

      expect(mockedAuthApi.authApi.defaults.headers.common["Authorization"]).toBe(
        "Bearer access-xyz"
      );
    });

    it("returns false and sets error on login failure", async () => {
      const axiosError = new Error("Invalid credentials");
      mockedAuthApi.login.mockRejectedValueOnce(axiosError);

      const result = await useAuthStore.getState().login("bad@example.com", "wrong");

      expect(result).toBe(false);
      const state = useAuthStore.getState();
      expect(state.error).toBe("Invalid credentials");
      expect(state.isLoading).toBe(false);
      expect(state.isAuthenticated).toBe(false);
    });

    it("returns false and sets error when getMe fails after login", async () => {
      mockedAuthApi.login.mockResolvedValueOnce(mockLoginResponse);
      mockedAuthApi.getMe.mockRejectedValueOnce(new Error("Server error"));

      const result = await useAuthStore.getState().login("test@example.com", "pass123");

      expect(result).toBe(false);
      expect(useAuthStore.getState().error).toBe("Server error");
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it("handles user without is_admin and credits fields", async () => {
      mockedAuthApi.login.mockResolvedValueOnce(mockLoginResponse);
      mockedAuthApi.getMe.mockResolvedValueOnce({
        id: "user-min",
        email: "min@example.com",
        is_verified: false,
        created_at: "2025-01-01T00:00:00Z",
      });

      await useAuthStore.getState().login("min@example.com", "pass");

      const user = useAuthStore.getState().user;
      expect(user?.is_admin).toBe(false);
      expect(user?.credits).toBe(0);
    });

    it("extracts detail from AxiosError response on login failure", async () => {
      const axiosError = {
        message: "Request failed with status code 401",
        isAxiosError: true,
        response: { data: { detail: "Email atau password salah" } },
      };
      mockedAuthApi.login.mockRejectedValueOnce(axiosError);

      await useAuthStore.getState().login("user@example.com", "wrong");

      expect(useAuthStore.getState().error).toBe("Email atau password salah");
    });

    it("clears previous error on new login attempt", async () => {
      useAuthStore.setState({ error: "previous error" });
      mockedAuthApi.login.mockResolvedValueOnce(mockLoginResponse);
      mockedAuthApi.getMe.mockResolvedValueOnce(mockUserResponse);

      await useAuthStore.getState().login("test@example.com", "pass123");

      expect(useAuthStore.getState().error).toBeNull();
    });
  });

  describe("register", () => {
    it("calls register API and returns true on success", async () => {
      mockedAuthApi.register.mockResolvedValueOnce({ message: "OK" });

      const result = await useAuthStore
        .getState()
        .register("new@example.com", "password123", "password123");

      expect(mockedAuthApi.register).toHaveBeenCalledWith(
        "new@example.com",
        "password123",
        "password123"
      );
      expect(result).toBe(true);
      expect(useAuthStore.getState().isLoading).toBe(false);
      expect(useAuthStore.getState().error).toBeNull();
    });

    it("returns false and sets error on register failure", async () => {
      mockedAuthApi.register.mockRejectedValueOnce(new Error("Email already taken"));

      const result = await useAuthStore
        .getState()
        .register("taken@example.com", "pass", "pass");

      expect(result).toBe(false);
      expect(useAuthStore.getState().error).toBe("Email already taken");
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  describe("logout", () => {
    it("clears user, tokens, auth state and localStorage", async () => {
      localStorage.setItem("accessToken", "existing");
      mockedAuthApi.authApi.defaults.headers.common["Authorization"] = "Bearer existing";
      useAuthStore.setState({
        user: { id: "u1", email: "a@b.com", is_verified: true, is_admin: false, credits: 5 },
        accessToken: "existing",
        isAuthenticated: true,
        error: "some error",
      });

      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBeNull();
      expect(localStorage.getItem("accessToken")).toBeNull();
      expect(
        mockedAuthApi.authApi.defaults.headers.common["Authorization"]
      ).toBeUndefined();
    });

    it("calls refreshToken during logout for cookie cleanup", async () => {
      mockedAuthApi.refreshToken.mockResolvedValueOnce({ access_token: "x" });

      await useAuthStore.getState().logout();

      expect(mockedAuthApi.refreshToken).toHaveBeenCalled();
    });

    it("handles refreshToken failure during logout gracefully", async () => {
      mockedAuthApi.refreshToken.mockRejectedValueOnce(new Error("Network error"));

      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe("verifyEmail", () => {
    it("calls verifyEmail API and marks user as verified", async () => {
      mockedAuthApi.verifyEmail.mockResolvedValueOnce({ message: "Verified" });
      useAuthStore.setState({
        user: {
          id: "u1",
          email: "a@b.com",
          is_verified: false,
          is_admin: false,
          credits: 0,
        },
      });

      const result = await useAuthStore.getState().verifyEmail("token-abc");

      expect(mockedAuthApi.verifyEmail).toHaveBeenCalledWith("token-abc");
      expect(result).toBe(true);
      expect(useAuthStore.getState().user?.is_verified).toBe(true);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it("returns true but does not crash when user is null", async () => {
      mockedAuthApi.verifyEmail.mockResolvedValueOnce({ message: "Verified" });

      const result = await useAuthStore.getState().verifyEmail("token-abc");

      expect(result).toBe(true);
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it("returns false and sets error on failure", async () => {
      mockedAuthApi.verifyEmail.mockRejectedValueOnce(new Error("Invalid token"));

      const result = await useAuthStore.getState().verifyEmail("bad-token");

      expect(result).toBe(false);
      expect(useAuthStore.getState().error).toBe("Invalid token");
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  describe("refreshAuth", () => {
    const mockRefreshResponse = {
      access_token: "refreshed-access",
      refresh_token: "refreshed-refresh",
      token_type: "bearer",
      expires_in: 3600,
    };

    const mockUserResponse = {
      id: "user-refreshed",
      email: "refreshed@example.com",
      is_verified: true,
      created_at: "2025-01-01T00:00:00Z",
    };

    it("refreshes token, fetches user, sets authenticated state", async () => {
      mockedAuthApi.refreshToken.mockResolvedValueOnce(mockRefreshResponse);
      mockedAuthApi.getMe.mockResolvedValueOnce(mockUserResponse);

      const result = await useAuthStore.getState().refreshAuth();

      expect(mockedAuthApi.refreshToken).toHaveBeenCalled();
      expect(mockedAuthApi.getMe).toHaveBeenCalled();
      expect(result).toBe(true);

      const state = useAuthStore.getState();
      expect(state.accessToken).toBe("refreshed-access");
      expect(state.user?.id).toBe("user-refreshed");
      expect(state.isAuthenticated).toBe(true);
      expect(localStorage.getItem("accessToken")).toBe("refreshed-access");
      expect(mockedAuthApi.authApi.defaults.headers.common["Authorization"]).toBe(
        "Bearer refreshed-access"
      );
    });

    it("clears auth state on refresh failure", async () => {
      localStorage.setItem("accessToken", "old-token");
      mockedAuthApi.authApi.defaults.headers.common["Authorization"] = "Bearer old-token";
      useAuthStore.setState({
        user: { id: "u1", email: "a@b.com", is_verified: true, is_admin: false, credits: 5 },
        accessToken: "old-token",
        isAuthenticated: true,
      });
      mockedAuthApi.refreshToken.mockRejectedValueOnce(new Error("Refresh failed"));

      const result = await useAuthStore.getState().refreshAuth();

      expect(result).toBe(false);
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(
        mockedAuthApi.authApi.defaults.headers.common["Authorization"]
      ).toBeUndefined();
    });
  });

  describe("clearError", () => {
    it("sets error to null", () => {
      useAuthStore.setState({ error: "some error" });
      useAuthStore.getState().clearError();
      expect(useAuthStore.getState().error).toBeNull();
    });
  });

  describe("initialize", () => {
    const mockUserResponse = {
      id: "user-init",
      email: "init@example.com",
      is_verified: true,
      created_at: "2025-01-01T00:00:00Z",
    };

    const mockRefreshResponse = {
      access_token: "refresh-init-access",
      refresh_token: "refresh-init-refresh",
      token_type: "bearer",
      expires_in: 3600,
    };

    it("uses stored token from localStorage, calls getMe, and authenticates", async () => {
      localStorage.setItem("accessToken", "stored-token");
      mockedAuthApi.getMe.mockResolvedValueOnce(mockUserResponse);

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.accessToken).toBe("stored-token");
      expect(state.user?.id).toBe("user-init");
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(mockedAuthApi.refreshToken).not.toHaveBeenCalled();
    });

    it("sets Authorization header from stored token", async () => {
      localStorage.setItem("accessToken", "stored-header-token");
      mockedAuthApi.getMe.mockResolvedValueOnce(mockUserResponse);

      await useAuthStore.getState().initialize();

      expect(mockedAuthApi.authApi.defaults.headers.common["Authorization"]).toBe(
        "Bearer stored-header-token"
      );
    });

    it("falls through to refreshAuth when stored token getMe fails", async () => {
      localStorage.setItem("accessToken", "expired-token");
      mockedAuthApi.getMe.mockRejectedValueOnce(new Error("Token expired"));
      mockedAuthApi.refreshToken.mockResolvedValueOnce(mockRefreshResponse);
      mockedAuthApi.getMe.mockResolvedValueOnce(mockUserResponse);

      await useAuthStore.getState().initialize();

      expect(localStorage.getItem("accessToken")).toBe("refresh-init-access");
      expect(useAuthStore.getState().accessToken).toBe("refresh-init-access");
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it("removes expired token from localStorage when getMe fails", async () => {
      localStorage.setItem("accessToken", "expired-token");
      mockedAuthApi.getMe.mockRejectedValueOnce(new Error("Token expired"));
      mockedAuthApi.refreshToken.mockResolvedValueOnce(mockRefreshResponse);
      mockedAuthApi.getMe.mockResolvedValueOnce(mockUserResponse);

      await useAuthStore.getState().initialize();

      expect(localStorage.getItem("accessToken")).toBe("refresh-init-access");
    });

    it("calls refreshAuth directly when no stored token", async () => {
      mockedAuthApi.refreshToken.mockResolvedValueOnce(mockRefreshResponse);
      mockedAuthApi.getMe.mockResolvedValueOnce(mockUserResponse);

      await useAuthStore.getState().initialize();

      expect(mockedAuthApi.refreshToken).toHaveBeenCalled();
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it("sets isLoading to false even when refreshAuth fails", async () => {
      mockedAuthApi.refreshToken.mockRejectedValueOnce(new Error("Network down"));

      await useAuthStore.getState().initialize();

      expect(useAuthStore.getState().isLoading).toBe(false);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it("sets isLoading to true at start", async () => {
      useAuthStore.setState({ isLoading: false });
      mockedAuthApi.refreshToken.mockRejectedValueOnce(new Error("x"));

      const promise = useAuthStore.getState().initialize();
      expect(useAuthStore.getState().isLoading).toBe(true);
      await promise;
    });
  });
});
