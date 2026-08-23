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
  };
});

describe("Guard host enroll UI", () => {
  beforeEach(() => {
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
        {
          id: "org1",
          name: "Org",
          slug: "org",
          role: "admin",
        } as never,
      ],
      activeOrgId: "org1",
    });
    vi.mocked(guardApi.getGuardStatus).mockResolvedValue({
      enabled: true,
      wazuh_group: "g",
      last_inventory_sync_at: null,
      last_alert_sync_at: null,
      last_sync_error: null,
      degraded: false,
    });
    vi.mocked(guardApi.listGuardAgents).mockResolvedValue([]);
    vi.mocked(guardApi.listGuardAlerts).mockResolvedValue([]);
    vi.mocked(guardApi.listEnrollTokens).mockResolvedValue([]);
    vi.mocked(guardApi.revokeEnrollToken).mockResolvedValue(undefined);
    vi.mocked(guardApi.createEnrollToken).mockResolvedValue({
      id: "tok1",
      label: "lab",
      expires_at: new Date().toISOString(),
      revoked_at: null,
      used_at: null,
      token: "raw-enroll-token-value-32chars!!",
      created_at: new Date().toISOString(),
    });
  });

  it("shows host steps and curl after Create token", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Guard />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Create token" }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Create token" }));

    await waitFor(() => {
      expect(screen.getByTestId("guard-host-enroll-steps")).toBeInTheDocument();
    });
    expect(screen.getByText(/Host steps \(after token\)/)).toBeInTheDocument();
    expect(
      screen.getAllByText(/raw-enroll-token-value-32chars!!/).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/api\/guard\/enroll/).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("button", { name: "Copy curl" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("guard-agent-install-steps")).toBeInTheDocument();
    expect(
      screen.getByText(/Agent install on host \(per distro\)/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/wazuh-agent/i).length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.getAllByText(/systemctl/i).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByTestId("guard-distro-install-commands"),
    ).toBeInTheDocument();
    expect(screen.getByText("Debian / Ubuntu")).toBeInTheDocument();
    expect(screen.getByText(/SLES \/ openSUSE/)).toBeInTheDocument();
    expect(document.body.textContent ?? "").toMatch(
      /apt-get install -y wazuh-agent/,
    );
  });

  it("revokes an active enroll token from the list", async () => {
    const user = userEvent.setup();
    vi.mocked(guardApi.listEnrollTokens).mockResolvedValue([
      {
        id: "tok-active",
        label: "e2e-revoke",
        expires_at: new Date().toISOString(),
        revoked_at: null,
        used_at: null,
        created_at: new Date().toISOString(),
      },
    ]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Guard />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const revokeBtn = await screen.findByRole("button", {
      name: /Revoke token/,
    });
    await user.click(revokeBtn);
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => {
      expect(guardApi.revokeEnrollToken).toHaveBeenCalledWith("tok-active");
    });
    const enrollTable = screen
      .getByTestId("guard-enroll-token-row")
      .closest("table");
    expect(enrollTable).toBeTruthy();
    expect(enrollTable?.className ?? "").toContain("min-w-[36rem]");
    expect(enrollTable?.className ?? "").not.toContain("table-fixed");
  });

  it("keeps agent columns from table-fixed crush on a narrow layout", async () => {
    vi.mocked(guardApi.listGuardAgents).mockResolvedValue([
      {
        id: "ag1",
        organization_id: "org1",
        wazuh_agent_id: "001",
        name: "e2e-tc5-2026081-long-host-name",
        status: "active",
        ip: "10.0.0.1",
        version: "4.7.0",
        last_keep_alive: "2026-08-17T14:05:00Z",
        synced_at: "2026-08-17T14:05:00Z",
        created_at: "2026-08-17T14:05:00Z",
      },
    ]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Guard />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Last seen")).toBeInTheDocument();
    expect(screen.getByText("Version")).toBeInTheDocument();
    const agentsCard = screen.getByTestId("guard-agents");
    const agentTable = agentsCard.querySelector("table");
    expect(agentTable).toBeTruthy();
    expect(agentTable?.className ?? "").toContain("min-w-[48rem]");
    expect(agentTable?.className ?? "").not.toContain("table-fixed");
  });
});
