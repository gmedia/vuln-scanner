import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getGuardStatus } from "@/api/guard";
import { listMonitors } from "@/api/uptime";
import { useAuthStore } from "@/store/authStore";
import { useFeatureStatus } from "@/hooks/use-feature-status";

vi.mock("@/api/guard", () => ({
  getGuardStatus: vi.fn(),
  canManageGuard: (role: string | null | undefined) =>
    role === "owner" || role === "admin",
}));

vi.mock("@/api/uptime", () => ({
  listMonitors: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

function setRole(role: "owner" | "admin" | "member" | "viewer") {
  useAuthStore.setState({
    activeOrgId: "org-1",
    organizations: [
      {
        id: "org-1",
        name: "Org One",
        slug: "org-one",
        role,
        kind: "team",
      },
    ],
  });
}

describe("useFeatureStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      activeOrgId: null,
      organizations: [],
    });
    vi.mocked(getGuardStatus).mockResolvedValue({
      enabled: true,
      wazuh_group: null,
      last_inventory_sync_at: null,
      last_alert_sync_at: null,
      last_sync_error: null,
      degraded: false,
    });
    vi.mocked(listMonitors).mockResolvedValue([]);
  });

  it("marks guard visible for an admin when status resolves 200", async () => {
    setRole("admin");

    const { result } = renderHook(() => useFeatureStatus(), { wrapper });

    await waitFor(() => {
      expect(result.current.guard).toBe(true);
    });
    expect(result.current.isGuardAdmin).toBe(true);
    expect(getGuardStatus).toHaveBeenCalled();
  });

  it("hides guard when status rejects with 503", async () => {
    setRole("admin");
    vi.mocked(getGuardStatus).mockRejectedValue({ response: { status: 503 } });

    const { result } = renderHook(() => useFeatureStatus(), { wrapper });

    await waitFor(() => {
      expect(result.current.guard).toBe(false);
    });
    expect(result.current.isGuardAdmin).toBe(true);
  });

  it("does not probe guard for a member", async () => {
    setRole("member");

    const { result } = renderHook(() => useFeatureStatus(), { wrapper });

    await waitFor(() => {
      expect(listMonitors).toHaveBeenCalled();
    });
    expect(result.current.isGuardAdmin).toBe(false);
    expect(result.current.guard).toBe(false);
    expect(getGuardStatus).not.toHaveBeenCalled();
  });

  it("marks uptime visible when monitors resolve 200", async () => {
    setRole("admin");

    const { result } = renderHook(() => useFeatureStatus(), { wrapper });

    await waitFor(() => {
      expect(result.current.uptime).toBe(true);
    });
    expect(listMonitors).toHaveBeenCalled();
  });

  it("hides uptime when monitors reject with 404", async () => {
    setRole("admin");
    vi.mocked(listMonitors).mockRejectedValue({ response: { status: 404 } });

    const { result } = renderHook(() => useFeatureStatus(), { wrapper });

    await waitFor(() => {
      expect(result.current.uptime).toBe(false);
    });
  });

  it("keeps uptime visible when monitors reject with 500", async () => {
    setRole("admin");
    vi.mocked(listMonitors).mockRejectedValue({ response: { status: 500 } });

    const { result } = renderHook(() => useFeatureStatus(), { wrapper });

    await waitFor(() => {
      expect(listMonitors).toHaveBeenCalled();
    });
    expect(result.current.uptime).toBe(true);
  });
});
