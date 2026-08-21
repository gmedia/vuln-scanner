import { create } from "zustand";
import * as authApi from "../api/auth";
import type { OrgSummary } from "../api/auth";
import * as orgsApi from "../api/orgs";
import type { OrgMembershipSummary, OrgRole } from "../api/orgs";
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

function mapOrgs(
  orgs: OrgSummary[] | OrgMembershipSummary[] | undefined,
): OrgMembershipSummary[] {
  if (!orgs || !Array.isArray(orgs)) return [];
  return orgs.map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    role: o.role as OrgRole,
    kind: o.kind,
  }));
}

function userFromMe(user: authApi.UserResponse) {
  return {
    id: user.id,
    email: user.email,
    is_verified: user.is_verified,
    is_admin: user.is_admin ?? false,
    credits: user.credits ?? 0,
  };
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
  organizations: OrgMembershipSummary[];
  activeOrgId: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (
    email: string,
    password: string,
    confirmPassword: string,
  ) => Promise<{
    ok: boolean;
    emailSent: boolean | null;
    message: string | null;
  }>;
  logout: () => Promise<void>;
  verifyEmail: (token: string) => Promise<boolean>;
  resendVerification: (email: string) => Promise<{
    ok: boolean;
    emailSent: boolean | null;
    message: string | null;
  }>;
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
  applyMe: (user: authApi.UserResponse) => void;
  switchOrganization: (organizationId: string) => Promise<boolean>;
  loadOrganizations: () => Promise<void>;
  activeRole: () => OrgRole | null;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  organizations: [],
  activeOrgId: null,

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

  applyMe: (user) => {
    const organizations = mapOrgs(user.organizations);
    const activeOrgId =
      user.active_org_id ??
      (organizations.length > 0 ? organizations[0].id : null);
    set({
      user: userFromMe(user),
      organizations,
      activeOrgId,
      isAuthenticated: true,
    });
    const locale = user.locale;
    if (locale === "id" || locale === "en") {
      void import("../i18n").then(({ default: i18n }) => {
        if (i18n.language !== locale) {
          void i18n.changeLanguage(locale);
        }
      });
    }
  },

  activeRole: () => {
    const { organizations, activeOrgId } = get();
    if (!activeOrgId || organizations.length === 0) return null;
    const match = organizations.find((o) => o.id === activeOrgId);
    return match?.role ?? null;
  },

  loadOrganizations: async () => {
    try {
      const list = await orgsApi.listOrgs();
      const { activeOrgId } = get();
      const nextActive =
        activeOrgId && list.some((o) => o.id === activeOrgId)
          ? activeOrgId
          : (list[0]?.id ?? null);
      set({ organizations: list, activeOrgId: nextActive });
    } catch {
      void 0;
    }
  },

  switchOrganization: async (organizationId) => {
    set({ error: null });
    try {
      const res = await orgsApi.switchOrg(organizationId);
      localStorage.setItem("accessToken", res.access_token);
      if (res.refresh_token) {
        localStorage.setItem("refreshToken", res.refresh_token);
      }
      authApi.authApi.defaults.headers.common["Authorization"] =
        `Bearer ${res.access_token}`;
      set({
        accessToken: res.access_token,
        activeOrgId: organizationId,
      });
      const user = await authApi.getMe();
      get().applyMe(user);
      if (!user.organizations?.length) {
        await get().loadOrganizations();
        set({ activeOrgId: organizationId });
      }
      return true;
    } catch (err) {
      const message = extractError(err, "Gagal beralih organisasi");
      set({ error: message });
      return false;
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
      get().applyMe(user);
      if (!user.organizations?.length) {
        await get().loadOrganizations();
      }
      set({ isLoading: false });
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
      const res = await authApi.register(email, password, confirmPassword);
      set({ isLoading: false });
      return {
        ok: true,
        emailSent: res.email_sent ?? null,
        message: res.message ?? null,
      };
    } catch (err) {
      const message = extractError(err, "Registrasi gagal");
      set({ error: message, isLoading: false });
      return { ok: false, emailSent: null, message: null };
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
    localStorage.removeItem("refreshToken");
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      error: null,
      organizations: [],
      activeOrgId: null,
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
      const res = await authApi.resendVerification(email);
      set({ isLoading: false });
      return {
        ok: true,
        emailSent: res.email_sent ?? null,
        message: res.message ?? null,
      };
    } catch (err) {
      const message = extractError(
        err,
        "Gagal mengirim ulang email verifikasi",
      );
      set({ error: message, isLoading: false });
      return { ok: false, emailSent: null, message: null };
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
      const storedRefresh = localStorage.getItem("refreshToken") || undefined;
      const refreshRes = await authApi.refreshToken(storedRefresh);
      set({ accessToken: refreshRes.access_token });
      localStorage.setItem("accessToken", refreshRes.access_token);
      if (refreshRes.refresh_token) {
        localStorage.setItem("refreshToken", refreshRes.refresh_token);
      }
      authApi.authApi.defaults.headers.common["Authorization"] =
        `Bearer ${refreshRes.access_token}`;
      const user = await authApi.getMe();
      get().applyMe(user);
      if (!user.organizations?.length) {
        await get().loadOrganizations();
      }
      return true;
    } catch {
      delete authApi.authApi.defaults.headers.common["Authorization"];
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        organizations: [],
        activeOrgId: null,
      });
      return false;
    }
  },

  clearError: () => set({ error: null }),

  initialize: async () => {
    set({ isLoading: true });

    const storedToken = localStorage.getItem("accessToken");
    if (storedToken) {
      set({ accessToken: storedToken });
      authApi.authApi.defaults.headers.common["Authorization"] =
        `Bearer ${storedToken}`;
      try {
        const user = await authApi.getMe();
        get().applyMe(user);
        if (!user.organizations?.length) {
          await get().loadOrganizations();
        }
        set({ isLoading: false });
        return;
      } catch {
        localStorage.removeItem("accessToken");
        set({ accessToken: null });
      }
    }

    await get().refreshAuth();
    set({ isLoading: false });
  },
}));
