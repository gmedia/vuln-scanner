import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Guard from "@/pages/Guard";
import { useAuthStore } from "@/store/authStore";
import * as guardApi from "@/api/guard";

vi.mock("@/api/guard", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/guard")>("@/api/guard");
  return {
    ...actual,
    getGuardStatus: vi.fn(),
    listGuardAgents: vi.fn(),
    listGuardAlerts: vi.fn(),
    listEnrollTokens: vi.fn(),
    createEnrollToken: vi.fn(),
    enableGuard: vi.fn(),
    syncGuard: vi.fn(),
    revokeEnrollToken: vi.fn(),
    issueHostAgentToken: vi.fn(),
    linkGuardAgentAsset: vi.fn(),
    disableGuardAgent: vi.fn(),
  };
});

vi.mock("@/api/assets", () => ({
  listAssets: vi.fn().mockResolvedValue([]),
}));

function renderGuard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Guard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function signIn(role: "admin" | "viewer") {
  useAuthStore.setState({
    user: {
      id: "u1",
      email: "admin@example.test",
      is_admin: false,
      is_verified: true,
      credits: 10,
    } as never,
    isAuthenticated: true,
    accessToken: "t",
    isLoading: false,
    error: null,
    organizations: [
      { id: "org1", name: "Org", slug: "org", role } as never,
    ],
    activeOrgId: "org1",
  });
}

const STATUS = {
  enabled: true,
  wazuh_group: "sinexis",
  last_inventory_sync_at: null,
  last_alert_sync_at: null,
  last_sync_error: null as string | null,
  degraded: false,
};

describe("Guard console states", () => {
  beforeEach(() => {
    signIn("admin");
    vi.mocked(guardApi.getGuardStatus).mockResolvedValue({ ...STATUS });
    vi.mocked(guardApi.listGuardAgents).mockResolvedValue([]);
    vi.mocked(guardApi.listGuardAlerts).mockResolvedValue([]);
    vi.mocked(guardApi.listEnrollTokens).mockResolvedValue([]);
    vi.mocked(guardApi.enableGuard).mockResolvedValue({ ...STATUS });
    vi.mocked(guardApi.syncGuard).mockResolvedValue({ ok: true });
  });

  it("shows the disabled island and the enable action when Guard is off", async () => {
    vi.mocked(guardApi.getGuardStatus).mockResolvedValue({
      ...STATUS,
      enabled: false,
    });
    renderGuard();

    await waitFor(() => {
      expect(screen.getByTestId("guard-disabled")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Enable Guard" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("guard-agents")).not.toBeInTheDocument();
    expect(screen.queryByTestId("guard-alerts")).not.toBeInTheDocument();
  });

  it("renders the status error copy for a non-auth failure", async () => {
    vi.mocked(guardApi.getGuardStatus).mockRejectedValue(new Error("boom"));
    renderGuard();

    await waitFor(() => {
      expect(screen.getByTestId("guard-status-error")).toHaveTextContent(
        "Could not load Guard status",
      );
    });
    expect(screen.queryByTestId("guard-disabled")).not.toBeInTheDocument();
  });

  it("shows the skeleton while status loads", () => {
    vi.mocked(guardApi.getGuardStatus).mockReturnValue(
      new Promise(() => undefined) as never,
    );
    renderGuard();
    expect(screen.getByTestId("guard-kpi-skeleton")).toBeInTheDocument();
  });

  it("renders the enabled state and agent/alert counts", async () => {
    vi.mocked(guardApi.listGuardAgents).mockResolvedValue([
      {
        id: "a1",
        organization_id: "org1",
        wazuh_agent_id: "001",
        name: "tc5",
        status: "active",
        ip: null,
        version: "4.9",
        last_keep_alive: null,
        last_helper_poll_at: null,
        synced_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      } as never,
    ]);
    vi.mocked(guardApi.listGuardAlerts).mockResolvedValue([
      {
        id: "al1",
        organization_id: "org1",
        external_id: "e1",
        rule_id: "5710",
        rule_level: 10,
        rule_description: "sshd brute force",
        agent_wazuh_id: "001",
        agent_name: "tc5",
        occurred_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      } as never,
    ]);
    renderGuard();

    await waitFor(() => {
      expect(screen.getByTestId("guard-state")).toHaveAttribute(
        "data-enabled",
        "true",
      );
    });
    expect(await screen.findByTestId("guard-agents")).toBeInTheDocument();
    expect(screen.getByTestId("guard-agent-row")).toHaveTextContent("tc5");
    expect(screen.getByTestId("guard-alerts")).toHaveTextContent(
      "sshd brute force",
    );
  });

  it("surfaces a degraded Guard", async () => {
    vi.mocked(guardApi.getGuardStatus).mockResolvedValue({
      ...STATUS,
      degraded: true,
    });
    renderGuard();

    await waitFor(() => {
      expect(screen.getByTestId("guard-kpi-strip")).toHaveTextContent(
        "degraded",
      );
    });
  });

  it("surfaces the last sync error", async () => {
    vi.mocked(guardApi.getGuardStatus).mockResolvedValue({
      ...STATUS,
      last_sync_error: "manager unreachable",
    });
    renderGuard();

    expect(await screen.findByText("manager unreachable")).toBeInTheDocument();
  });

  it("toggles technical details", async () => {
    const user = userEvent.setup();
    renderGuard();

    const toggle = await screen.findByRole("button", {
      name: "Technical details",
    });
    expect(screen.queryByText("sinexis")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByText("sinexis")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hide technical details" }),
    ).toBeInTheDocument();
  });

  it("hides the enroll panel from a non-admin member", async () => {
    signIn("viewer");
    renderGuard();

    await waitFor(() => {
      expect(screen.getByTestId("guard-agents")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "Create token" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sync" }),
    ).not.toBeInTheDocument();
  });
});
