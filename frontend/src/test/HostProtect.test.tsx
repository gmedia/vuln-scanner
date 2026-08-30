import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HostProtect, { mapHostError } from "@/pages/HostProtect";
import { useAuthStore } from "@/store/authStore";
import * as hostApi from "@/api/hostProtect";
import * as guardApi from "@/api/guard";

vi.mock("@/api/hostProtect", async () => {
  const actual = await vi.importActual<typeof import("@/api/hostProtect")>(
    "@/api/hostProtect",
  );
  return {
    ...actual,
    listHostSites: vi.fn(),
    createHostSite: vi.fn(),
    deleteHostSite: vi.fn(),
    enqueueHostScan: vi.fn(),
    listHostHits: vi.fn(),
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

function renderHost() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HostProtect />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Host Protect page", () => {
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
    vi.mocked(hostApi.listHostSites).mockResolvedValue([]);
    vi.mocked(hostApi.listHostHits).mockResolvedValue([]);
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

  it("maps sku limit errors", () => {
    expect(mapHostError("Site limit for basic tier is 1")).toBe("limit");
  });

  it("shows empty state and frozen host-page testid", async () => {
    renderHost();
    await waitFor(() =>
      expect(screen.getByTestId("host-empty")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("host-page")).toBeInTheDocument();
    expect(screen.getByTestId("host-empty-cta")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Host Protect" })).toBeInTheDocument();
    expect(screen.queryByText(/Open Wazuh/i)).not.toBeInTheDocument();
  });

  it("creates a site", async () => {
    vi.mocked(hostApi.createHostSite).mockResolvedValue({
      id: "s1",
      organization_id: "org1",
      guard_agent_id: "a1",
      asset_id: null,
      name: "Web",
      root_path: "/var/www/html",
      cms_hint: "wordpress",
      enabled: true,
      auto_quarantine: false,
      created_by: "u1",
      created_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
      sku: "multi",
      sku_limit: 10,
    });
    const user = userEvent.setup();
    renderHost();
    await waitFor(() => expect(hostApi.listHostSites).toHaveBeenCalled());
    await user.click(screen.getByTestId("host-add"));
    await user.type(screen.getByTestId("host-name"), "Web");
    await user.type(screen.getByTestId("host-root"), "/var/www/html");
    await waitFor(() =>
      expect(screen.getByTestId("host-save")).not.toBeDisabled(),
    );
    await user.click(screen.getByTestId("host-save"));
    await waitFor(() => expect(hostApi.createHostSite).toHaveBeenCalled());
  });

  it("treats list 404 as feature off", async () => {
    vi.mocked(hostApi.listHostSites).mockRejectedValue({
      response: { status: 404, data: { detail: "Not found" } },
    });
    renderHost();
    await waitFor(() => {
      expect(screen.getByTestId("host-feature-off")).toBeInTheDocument();
    });
    expect(hostApi.listHostHits).not.toHaveBeenCalled();
  });
});
