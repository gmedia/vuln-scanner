import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Siem from "@/pages/Siem";
import { useAuthStore } from "@/store/authStore";
import * as siemApi from "@/api/siem";
import * as guardApi from "@/api/guard";

vi.mock("@/api/siem", async () => {
  const actual = await vi.importActual<typeof import("@/api/siem")>(
    "@/api/siem",
  );
  return {
    ...actual,
    getSiemStatus: vi.fn(),
    listSiemEvents: vi.fn(),
    listSiemCases: vi.fn(),
    createSiemCase: vi.fn(),
    patchSiemCase: vi.fn(),
    addSiemCaseNote: vi.fn(),
  };
});

vi.mock("@/api/guard", async () => {
  const actual = await vi.importActual<typeof import("@/api/guard")>(
    "@/api/guard",
  );
  return {
    ...actual,
    listGuardAgents: vi.fn(),
  };
});

function renderSiem() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Siem />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SIEM page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: "u1",
        email: "member@example.test",
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
          role: "member",
        } as never,
      ],
      activeOrgId: "org1",
    });
    vi.mocked(siemApi.getSiemStatus).mockResolvedValue({
      enabled: true,
      indexer_reachable: true,
      degraded: false,
      last_error: null,
      search_min_level: 7,
      max_lookback_hours: 168,
      max_page_size: 50,
      include_full_log: false,
      wazuh_group: "org_x",
    });
    vi.mocked(siemApi.listSiemEvents).mockResolvedValue({
      items: [
        {
          external_id: "evt-1",
          rule_id: "5503",
          rule_level: 10,
          rule_description: "Login failed",
          agent_wazuh_id: "001",
          agent_name: "web-1",
          occurred_at: "2026-08-14T10:00:00Z",
        },
      ],
      degraded: false,
      last_error: null,
    });
    vi.mocked(siemApi.listSiemCases).mockResolvedValue({ items: [] });
    vi.mocked(guardApi.listGuardAgents).mockResolvedValue([
      {
        id: "a1",
        organization_id: "org1",
        wazuh_agent_id: "001",
        name: "web-1",
        status: "active",
        ip: null,
        version: null,
        last_keep_alive: null,
        synced_at: "2026-08-14T10:00:00Z",
        created_at: "2026-08-14T10:00:00Z",
      },
    ]);
  });

  it("searches events and opens detail without Wazuh dashboard copy", async () => {
    const user = userEvent.setup();
    renderSiem();

    await waitFor(() => {
      expect(screen.getAllByText("Login failed").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/Open Wazuh dashboard/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "SIEM" })).toBeInTheDocument();
    expect(screen.getAllByText("L10 · High").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Search box")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Search events" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Cases" })).toBeInTheDocument();
    expect(screen.getByTestId("siem-event-detail-empty")).toBeInTheDocument();

    await user.click(screen.getAllByText("Login failed")[0]);
    expect(screen.getByTestId("siem-event-detail")).toBeInTheDocument();
    expect(screen.getByText("evt-1")).toBeInTheDocument();
  });

  it("shows Guard-first empty copy when no agents", async () => {
    vi.mocked(guardApi.listGuardAgents).mockResolvedValue([]);
    renderSiem();
    await waitFor(() => {
      expect(screen.getByTestId("siem-no-agents")).toBeInTheDocument();
    });
  });

  it("treats status 404 as feature off", async () => {
    vi.mocked(siemApi.getSiemStatus).mockRejectedValue({
      response: { status: 404, data: { detail: "Not found" } },
    });
    renderSiem();
    await waitFor(() => {
      expect(screen.getByTestId("siem-feature-off")).toBeInTheDocument();
    });
    expect(siemApi.listSiemEvents).not.toHaveBeenCalled();
  });
});
