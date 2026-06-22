import { create } from "zustand";
import * as authApi from "../api/auth";

interface User {
  id: string;
  email: string;
  is_verified: boolean;
}

interface AuthStore {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, confirmPassword: string) => Promise<boolean>;
  logout: () => Promise<void>;
  verifyEmail: (token: string) => Promise<boolean>;
  refreshAuth: () => Promise<boolean>;
  clearError: () => void;
  initialize: () => Promise<void>;
  setAccessToken: (token: string | null) => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  setAccessToken: (token) => set({ accessToken: token }),

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const loginRes = await authApi.login(email, password);
      set({ accessToken: loginRes.access_token });
      authApi.authApi.defaults.headers.common["Authorization"] = `Bearer ${loginRes.access_token}`;
      const user = await authApi.getMe();
      set({
        user: { id: user.id, email: user.email, is_verified: user.is_verified },
        isAuthenticated: true,
        isLoading: false,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
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
      const message = err instanceof Error ? err.message : "Registration failed";
      set({ error: message, isLoading: false });
      return false;
    }
  },

  logout: async () => {
    try {
      await authApi.refreshToken();
    } catch { }
    delete authApi.authApi.defaults.headers.common["Authorization"];
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
      const message = err instanceof Error ? err.message : "Email verification failed";
      set({ error: message, isLoading: false });
      return false;
    }
  },

  refreshAuth: async () => {
    try {
      const refreshRes = await authApi.refreshToken();
      set({ accessToken: refreshRes.access_token });
      authApi.authApi.defaults.headers.common["Authorization"] = `Bearer ${refreshRes.access_token}`;
      const user = await authApi.getMe();
      set({
        user: { id: user.id, email: user.email, is_verified: user.is_verified },
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
    await get().refreshAuth();
    set({ isLoading: false });
  },
}));
