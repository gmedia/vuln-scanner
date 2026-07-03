import { create } from "zustand";
import * as authApi from "../api/auth";
import { isAxiosError } from "axios";

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    if (err.response?.status === 429) {
      const retryAfter = err.response.headers?.["retry-after"];
      const seconds = retryAfter ? parseInt(retryAfter, 10) : null;
      if (seconds && !isNaN(seconds)) {
        return `Too many attempts. Please wait ${seconds} seconds before trying again.`;
      }
      return "Too many attempts. Please wait before trying again.";
    }
    if (err.response?.data?.detail) {
      return err.response.data.detail;
    }
  }
  return err instanceof Error ? err.message : fallback;
}

interface User {
  id: string;
  email: string;
  is_verified: boolean;
  is_admin: boolean;
  credits: number;
}

interface AuthStore {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (
    email: string,
    password: string,
    confirmPassword: string,
  ) => Promise<boolean>;
  logout: () => Promise<void>;
  verifyEmail: (token: string) => Promise<boolean>;
  resendVerification: (email: string) => Promise<boolean>;
  updateProfile: (email: string, currentPassword: string) => Promise<boolean>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) => Promise<boolean>;
  forgotPassword: (email: string) => Promise<boolean>;
  resetPassword: (
    token: string,
    newPassword: string,
    confirmPassword: string,
  ) => Promise<boolean>;
  refreshAuth: () => Promise<boolean>;
  clearError: () => void;
  initialize: () => Promise<void>;
  setAccessToken: (token: string | null) => void;
  setCredits: (credits: number) => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  setAccessToken: (token) => {
    if (token) {
      localStorage.setItem("accessToken", token);
    } else {
      localStorage.removeItem("accessToken");
    }
    set({ accessToken: token });
  },

  setCredits: (credits) => {
    const currentUser = get().user;
    if (currentUser) {
      set({ user: { ...currentUser, credits } });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const loginRes = await authApi.login(email, password);
      set({ accessToken: loginRes.access_token });
      localStorage.setItem("accessToken", loginRes.access_token);
      authApi.authApi.defaults.headers.common["Authorization"] =
        `Bearer ${loginRes.access_token}`;
      const user = await authApi.getMe();
      set({
        user: {
          id: user.id,
          email: user.email,
          is_verified: user.is_verified,
          is_admin: user.is_admin ?? false,
          credits: user.credits ?? 0,
        },
        isAuthenticated: true,
        isLoading: false,
      });
      return true;
    } catch (err) {
      const message = extractError(err, "Login gagal");
      set({ error: message, isLoading: false });
      return false;
    }
  },

  register: async (email, password, confirmPassword) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.register(email, password, confirmPassword);
      set({ isLoading: false });
      return true;
    } catch (err) {
      const message = extractError(err, "Registrasi gagal");
      set({ error: message, isLoading: false });
      return false;
    }
  },

  logout: async () => {
    try {
      await authApi.refreshToken();
    } catch {
      /* refresh token cleanup — ignore failures */
    }
    delete authApi.authApi.defaults.headers.common["Authorization"];
    localStorage.removeItem("accessToken");
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      error: null,
    });
  },

  verifyEmail: async (token) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.verifyEmail(token);
      const currentUser = get().user;
      if (currentUser) {
        set({ user: { ...currentUser, is_verified: true }, isLoading: false });
      } else {
        set({ isLoading: false });
      }
      return true;
    } catch (err) {
      const message = extractError(err, "Verifikasi email gagal");
      set({ error: message, isLoading: false });
      return false;
    }
  },

  resendVerification: async (email) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.resendVerification(email);
      set({ isLoading: false });
      return true;
    } catch (err) {
      const message = extractError(
        err,
        "Gagal mengirim ulang email verifikasi",
      );
      set({ error: message, isLoading: false });
      return false;
    }
  },

  updateProfile: async (email, currentPassword) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.updateProfile(email, currentPassword);
      const currentUser = get().user;
      if (currentUser) {
        set({ user: { ...currentUser, email }, isLoading: false });
      } else {
        set({ isLoading: false });
      }
      return true;
    } catch (err) {
      const message = extractError(err, "Gagal memperbarui profil");
      set({ error: message, isLoading: false });
      return false;
    }
  },

  changePassword: async (currentPassword, newPassword, confirmPassword) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.changePassword(
        currentPassword,
        newPassword,
        confirmPassword,
      );
      set({ isLoading: false, error: null });
      return true;
    } catch (err) {
      const message = extractError(err, "Gagal mengubah kata sandi");
      set({ error: message, isLoading: false });
      return false;
    }
  },

  forgotPassword: async (email) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.forgotPassword(email);
      set({ isLoading: false });
      return true;
    } catch (err) {
      const message = extractError(err, "Gagal mengirim email reset password");
      set({ error: message, isLoading: false });
      return false;
    }
  },

  resetPassword: async (token, newPassword, confirmPassword) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.resetPassword(token, newPassword, confirmPassword);
      set({ isLoading: false, error: null });
      return true;
    } catch (err) {
      const message = extractError(err, "Gagal mereset password");
      set({ error: message, isLoading: false });
      return false;
    }
  },

  refreshAuth: async () => {
    try {
      const refreshRes = await authApi.refreshToken();
      set({ accessToken: refreshRes.access_token });
      localStorage.setItem("accessToken", refreshRes.access_token);
      authApi.authApi.defaults.headers.common["Authorization"] =
        `Bearer ${refreshRes.access_token}`;
      const user = await authApi.getMe();
      set({
        user: {
          id: user.id,
          email: user.email,
          is_verified: user.is_verified,
          is_admin: user.is_admin ?? false,
          credits: user.credits ?? 0,
        },
        isAuthenticated: true,
      });
      return true;
    } catch {
      delete authApi.authApi.defaults.headers.common["Authorization"];
      set({ user: null, accessToken: null, isAuthenticated: false });
      return false;
    }
  },

  clearError: () => set({ error: null }),

  initialize: async () => {
    set({ isLoading: true });

    // If globalSetup stored a token in localStorage, use it directly
    // to avoid calling refreshAuth() (which hits rate limits in CI).
    const storedToken = localStorage.getItem("accessToken");
    if (storedToken) {
      set({ accessToken: storedToken });
      authApi.authApi.defaults.headers.common["Authorization"] =
        `Bearer ${storedToken}`;
      try {
        const user = await authApi.getMe();
        set({
          user: {
            id: user.id,
            email: user.email,
            is_verified: user.is_verified,
            is_admin: (user as { is_admin?: boolean }).is_admin ?? false,
            credits: (user as { credits?: number }).credits ?? 0,
          },
          isAuthenticated: true,
          isLoading: false,
        });
        return;
      } catch {
        // Token expired or invalid — remove it and fall through to refreshAuth
        localStorage.removeItem("accessToken");
        set({ accessToken: null });
      }
    }

    await get().refreshAuth();
    set({ isLoading: false });
  },
}));
