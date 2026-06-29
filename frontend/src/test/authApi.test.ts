import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/store/authStore", () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ accessToken: null })),
  },
}));

vi.mock("axios", () => {
  const mockAxios = {
    create: vi.fn(() => mockAxios),
    get: vi.fn(),
    post: vi.fn(),
    defaults: {},
    interceptors: {
      request: { use: vi.fn() },
    },
  };
  return {
    default: mockAxios,
    isAxiosError: vi.fn((err: unknown) =>
      err !== null && typeof err === "object" && "isAxiosError" in err
    ),
  };
});

vi.stubGlobal("import", {
  meta: {
    env: {
      VITE_API_URL: "",
      VITE_WS_URL: "",
    },
  },
});

import axios from "axios";
import {
  authApi,
  register,
  login,
  verifyEmail,
  refreshToken,
  getMe,
} from "@/api/auth";
import type {
  MessageResponse,
  LoginResponse,
  UserResponse,
} from "@/api/auth";

const mockAxios = axios as unknown as ReturnType<typeof vi.fn> & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

describe("auth API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("authApi instance", () => {
    it("creates axios instance with correct config", () => {
      expect(authApi).toBeDefined();
    });
  });

  describe("register", () => {
    it("posts to /api/auth/register with email, password, and confirm_password", async () => {
      const mockResponse: MessageResponse = {
        message: "Registrasi berhasil. Silakan cek email untuk verifikasi.",
      };
      mockAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const result = await register("user@example.com", "password123", "password123");
      expect(mockAxios.post).toHaveBeenCalledWith("/api/auth/register", {
        email: "user@example.com",
        password: "password123",
        confirm_password: "password123",
      });
      expect(result).toEqual(mockResponse);
    });

    it("returns the message response on success", async () => {
      const mockResponse: MessageResponse = { message: "OK" };
      mockAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const result = await register("a@b.com", "pass", "pass");
      expect(result.message).toBe("OK");
    });
  });

  describe("login", () => {
    it("posts to /api/auth/login with email and password", async () => {
      const mockResponse: LoginResponse = {
        access_token: "access-abc",
        refresh_token: "refresh-abc",
        token_type: "bearer",
        expires_in: 3600,
      };
      mockAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const result = await login("user@example.com", "password123");
      expect(mockAxios.post).toHaveBeenCalledWith("/api/auth/login", {
        email: "user@example.com",
        password: "password123",
      });
      expect(result).toEqual(mockResponse);
    });

    it("returns LoginResponse with access_token and refresh_token", async () => {
      const mockResponse: LoginResponse = {
        access_token: "at-1",
        refresh_token: "rt-1",
        token_type: "bearer",
        expires_in: 1800,
      };
      mockAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const result = await login("test@test.com", "secret");
      expect(result.access_token).toBe("at-1");
      expect(result.refresh_token).toBe("rt-1");
      expect(result.token_type).toBe("bearer");
      expect(result.expires_in).toBe(1800);
    });
  });

  describe("verifyEmail", () => {
    it("posts to /api/auth/verify-email with token", async () => {
      const mockResponse: MessageResponse = {
        message: "Email berhasil diverifikasi.",
      };
      mockAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const result = await verifyEmail("verification-token-123");
      expect(mockAxios.post).toHaveBeenCalledWith("/api/auth/verify-email", {
        token: "verification-token-123",
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe("refreshToken", () => {
    it("posts to /api/auth/refresh with refresh_token when provided", async () => {
      const mockResponse: LoginResponse = {
        access_token: "new-access",
        refresh_token: "new-refresh",
        token_type: "bearer",
        expires_in: 3600,
      };
      mockAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const result = await refreshToken("existing-refresh-token");
      expect(mockAxios.post).toHaveBeenCalledWith("/api/auth/refresh", {
        refresh_token: "existing-refresh-token",
      });
      expect(result.access_token).toBe("new-access");
    });

    it("posts to /api/auth/refresh with empty body when no refresh_token", async () => {
      const mockResponse: LoginResponse = {
        access_token: "new-access-2",
        refresh_token: "new-refresh-2",
        token_type: "bearer",
        expires_in: 3600,
      };
      mockAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const result = await refreshToken();
      expect(mockAxios.post).toHaveBeenCalledWith("/api/auth/refresh", {});
      expect(result.access_token).toBe("new-access-2");
    });
  });

  describe("getMe", () => {
    it("gets /api/auth/me and returns user response", async () => {
      const mockResponse: UserResponse = {
        id: "user-1",
        email: "user@example.com",
        is_verified: true,
        created_at: "2025-01-01T00:00:00Z",
      };
      mockAxios.get.mockResolvedValueOnce({ data: mockResponse });

      const result = await getMe();
      expect(mockAxios.get).toHaveBeenCalledWith("/api/auth/me");
      expect(result).toEqual(mockResponse);
    });

    it("returns user with is_verified field", async () => {
      const mockResponse: UserResponse = {
        id: "u-2",
        email: "unverified@example.com",
        is_verified: false,
        created_at: "2025-06-01T00:00:00Z",
      };
      mockAxios.get.mockResolvedValueOnce({ data: mockResponse });

      const result = await getMe();
      expect(result.is_verified).toBe(false);
    });
  });
});
