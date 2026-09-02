import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HostProtect, { mapHostError } from "@/pages/HostProtect";
import { useAuthStore } from "@/store/authStore";
import * as hostApi from "@/api/hostProtect";
import * as hostWafApi from "@/api/hostWaf";
import * as guardApi from "@/api/guard";

vi.mock("@/api/hostProtect", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/hostProtect")>(
      "@/api/hostProtect",
    );
  return {
    ...actual,
    listHostSites: vi.fn(),
    createHostSite: vi.fn(),
    updateHostSite: vi.fn(),
    deleteHostSite: vi.fn(),
    enqueueHostScan: vi.fn(),
    listHostScans: vi.fn(),
    listHostHits: vi.fn(),
    quarantineHostHit: vi.fn(),
    restoreHostHit: vi.fn(),
    ignoreHostHit: vi.fn(),
  };
});

vi.mock("@/api/hostWaf", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/hostWaf")>("@/api/hostWaf");
  return {
    ...actual,
    listHostWafPolicies: vi.fn(),
    listHostWafEvents: vi.fn(),
    upsertHostWafPolicy: vi.fn(),
    simulateHostWaf: vi.fn(),
    fetchHostWafSnippet: vi.fn(),
  };
});

vi.mock("@/api/guard", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/guard")>("@/api/guard");
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
    vi.mocked(hostApi.listHostScans).mockResolvedValue([]);
    vi.mocked(hostWafApi.listHostWafPolicies).mockResolvedValue([]);
    vi.mocked(hostWafApi.listHostWafEvents).mockResolvedValue([]);
    vi.mocked(hostWafApi.fetchHostWafSnippet).mockResolvedValue({
      site_id: "s1",
      engine: "mock",
      mode: "off",
      filename: "sinexis-host-waf.conf",
      content: "# do not paste onto sinexis.app\n",
    });
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
        last_helper_poll_at: null,
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
    expect(screen.queryByTestId("host-add")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Host Protect" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Open Wazuh/i)).not.toBeInTheDocument();
  });

  it("shows honesty copy that missing roots do not invent malware", async () => {
    vi.mocked(hostApi.listHostSites).mockResolvedValue([
      {
        id: "s1",
        organization_id: "org1",
        guard_agent_id: "a1",
        asset_id: null,
        name: "Web",
        root_path: "/var/www/html",
        cms_hint: "wordpress",
        enabled: true,
        auto_quarantine: false,
        scan_interval: "daily",
        created_by: "u1",
        created_at: "2026-08-30T00:00:00Z",
        updated_at: "2026-08-30T00:00:00Z",
        sku: "multi",
        sku_limit: 10,
      },
    ]);
    renderHost();
    await waitFor(() =>
      expect(screen.getByText(/on-box helper on the Guard host/i)).toBeInTheDocument(),
    );
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
      scan_interval: "daily",
      created_by: "u1",
      created_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
      sku: "multi",
      sku_limit: 10,
    });
    const user = userEvent.setup();
    renderHost();
    await waitFor(() =>
      expect(screen.getByTestId("host-empty-cta")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("host-empty-cta"));
    expect(screen.getByTestId("host-helper-required")).toBeInTheDocument();
    expect(
      screen.getByText(/Helper has not polled this agent yet/i),
    ).toBeInTheDocument();
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

  it("quarantines an open hit", async () => {
    vi.mocked(hostApi.listHostSites).mockResolvedValue([
      {
        id: "s1",
        organization_id: "org1",
        guard_agent_id: "a1",
        asset_id: null,
        name: "Web",
        root_path: "/var/www/html",
        cms_hint: "wordpress",
        enabled: true,
        auto_quarantine: false,
        scan_interval: "daily",
        created_by: "u1",
        created_at: "2026-08-30T00:00:00Z",
        updated_at: "2026-08-30T00:00:00Z",
        sku: "multi",
        sku_limit: 10,
      },
    ]);
    vi.mocked(hostApi.listHostHits).mockResolvedValue([
      {
        id: "h1",
        organization_id: "org1",
        site_id: "s1",
        scan_id: null,
        rel_path: "app/Http/evil.php",
        class: "webshell",
        engine: "yara",
        rule_id: "yara.webshell.php",
        status: "open",
        sha256: null,
        first_seen_at: "2026-08-30T00:00:00Z",
        last_seen_at: "2026-08-30T00:00:00Z",
      },
    ]);
    vi.mocked(hostApi.quarantineHostHit).mockResolvedValue({
      id: "h1",
      organization_id: "org1",
      site_id: "s1",
      scan_id: null,
      rel_path: "wp-content/uploads/cache.php",
      class: "webshell",
      engine: "mock",
      rule_id: "mock.webshell.php",
      status: "quarantined",
      sha256: null,
      first_seen_at: "2026-08-30T00:00:00Z",
      last_seen_at: "2026-08-30T00:00:00Z",
    });
    const user = userEvent.setup();
    renderHost();
    await waitFor(() =>
      expect(screen.getByTestId("host-quarantine")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("host-quarantine"));
    await waitFor(() => expect(hostApi.quarantineHostHit).toHaveBeenCalled());
    expect(vi.mocked(hostApi.quarantineHostHit).mock.calls[0][0]).toBe("h1");
  });

  it("shows queued scan copy instead of silent empty hits", async () => {
    vi.mocked(hostApi.listHostSites).mockResolvedValue([
      {
        id: "s1",
        organization_id: "org1",
        guard_agent_id: "a1",
        asset_id: null,
        name: "Erp Stg",
        root_path: "/var/www/stg/member-pay",
        cms_hint: "unknown",
        enabled: true,
        auto_quarantine: false,
        scan_interval: "daily",
        created_by: "u1",
        created_at: "2026-08-30T00:00:00Z",
        updated_at: "2026-08-30T00:00:00Z",
        sku: "multi",
        sku_limit: 10,
      },
    ]);
    vi.mocked(hostApi.listHostScans).mockResolvedValue([
      {
        id: "sc1",
        organization_id: "org1",
        site_id: "s1",
        status: "queued",
        trigger: "manual",
        started_at: null,
        finished_at: null,
        error: null,
        hit_count: 0,
        created_at: "2026-08-30T00:00:00Z",
      },
    ]);
    renderHost();
    await waitFor(() =>
      expect(screen.getByTestId("host-scan-status")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("host-hits-empty").textContent).toMatch(
      /on-box helper/i,
    );
    expect(screen.getByTestId("host-interval-existing")).toBeInTheDocument();
  });

  it("hides leftover mock-engine hits", async () => {
    vi.mocked(hostApi.listHostSites).mockResolvedValue([
      {
        id: "s1",
        organization_id: "org1",
        guard_agent_id: "a1",
        asset_id: null,
        name: "Web",
        root_path: "/var/www/html",
        cms_hint: "wordpress",
        enabled: true,
        auto_quarantine: false,
        scan_interval: "daily",
        created_by: "u1",
        created_at: "2026-08-30T00:00:00Z",
        updated_at: "2026-08-30T00:00:00Z",
        sku: "multi",
        sku_limit: 10,
      },
    ]);
    vi.mocked(hostApi.listHostHits).mockResolvedValue([
      {
        id: "h-mock",
        organization_id: "org1",
        site_id: "s1",
        scan_id: null,
        rel_path: "wp-content/uploads/cache.php",
        class: "webshell",
        engine: "mock",
        rule_id: "mock.webshell.php",
        status: "open",
        sha256: null,
        first_seen_at: "2026-08-30T00:00:00Z",
        last_seen_at: "2026-08-30T00:00:00Z",
      },
    ]);
    renderHost();
    await waitFor(() =>
      expect(screen.getByTestId("host-hits-empty")).toBeInTheDocument(),
    );
    expect(screen.queryByText("wp-content/uploads/cache.php")).not.toBeInTheDocument();
  });

  it("opens WAF tab with frozen host-waf-panel testid", async () => {
    const user = userEvent.setup();
    renderHost();
    await waitFor(() =>
      expect(screen.getByTestId("host-tab-waf")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("host-tab-waf"));
    await waitFor(() =>
      expect(screen.getByTestId("host-waf-panel")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("host-waf-events-empty")).toBeInTheDocument();
  });

  it("copies WAF snippet to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
      });
    } else {
      vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);
    }
    vi.mocked(hostApi.listHostSites).mockResolvedValue([
      {
        id: "s1",
        organization_id: "org1",
        guard_agent_id: "a1",
        asset_id: null,
        name: "Web",
        root_path: "/var/www/html",
        cms_hint: "wordpress",
        enabled: true,
        auto_quarantine: false,
        scan_interval: "daily",
        created_by: "u1",
        created_at: "2026-08-30T00:00:00Z",
        updated_at: "2026-08-30T00:00:00Z",
        sku: "multi",
        sku_limit: 10,
      },
    ]);
    const user = userEvent.setup();
    renderHost();
    await waitFor(() =>
      expect(screen.getByTestId("host-tab-waf")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("host-tab-waf"));
    await waitFor(() =>
      expect(screen.getByTestId("host-waf-copy-snippet")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("host-waf-copy-snippet"));
    await waitFor(() =>
      expect(hostWafApi.fetchHostWafSnippet).toHaveBeenCalledWith("s1"),
    );
    expect(writeText).toHaveBeenCalled();
  });

  it("treats WAF list 404 as feature off", async () => {
    vi.mocked(hostWafApi.listHostWafPolicies).mockRejectedValue({
      response: { status: 404, data: { detail: "Not found" } },
    });
    const user = userEvent.setup();
    renderHost();
    await waitFor(() =>
      expect(screen.getByTestId("host-tab-waf")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("host-tab-waf"));
    await waitFor(() =>
      expect(screen.getByTestId("host-waf-off")).toBeInTheDocument(),
    );
  });
});
