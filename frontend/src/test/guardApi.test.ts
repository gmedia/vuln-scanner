import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/api/scans", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

import {
  canManageGuard,
  createEnrollToken,
  disableGuardAgent,
  enableGuard,
  getGuardStatus,
  issueHostAgentToken,
  linkGuardAgentAsset,
  listEnrollTokens,
  listGuardAgents,
  listGuardAlerts,
  revokeEnrollToken,
  syncGuard,
} from "@/api/guard";

const status = {
  enabled: true,
  wazuh_group: "org1",
  last_inventory_sync_at: "2026-08-01T00:00:00Z",
  last_alert_sync_at: "2026-08-01T00:00:00Z",
  last_sync_error: null,
  degraded: false,
};

const agent = {
  id: "ag1",
  organization_id: "org1",
  wazuh_agent_id: "001",
  name: "web-1",
  status: "active",
  ip: "10.0.0.5",
  version: "4.9.0",
  last_keep_alive: "2026-08-01T00:00:00Z",
  last_helper_poll_at: null,
  synced_at: "2026-08-01T00:00:00Z",
  created_at: "2026-08-01T00:00:00Z",
};

const enrollToken = {
  id: "et1",
  label: "web-1",
  expires_at: "2026-08-02T00:00:00Z",
  revoked_at: null,
  used_at: null,
  created_at: "2026-08-01T00:00:00Z",
};

describe("guard API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getGuardStatus GETs /api/guard/status", async () => {
    mockGet.mockResolvedValue({ data: status });
    await expect(getGuardStatus()).resolves.toEqual(status);
    expect(mockGet).toHaveBeenCalledWith("/api/guard/status");
  });

  it("enableGuard POSTs /api/guard/enable", async () => {
    mockPost.mockResolvedValue({ data: status });
    await expect(enableGuard()).resolves.toEqual(status);
    expect(mockPost).toHaveBeenCalledWith("/api/guard/enable");
  });

  it("listGuardAgents GETs /api/guard/agents", async () => {
    mockGet.mockResolvedValue({ data: [agent] });
    await expect(listGuardAgents()).resolves.toEqual([agent]);
    expect(mockGet).toHaveBeenCalledWith("/api/guard/agents");
  });

  it("listGuardAlerts GETs alerts with the default limit", async () => {
    const alerts = [
      {
        id: "al1",
        organization_id: "org1",
        external_id: "ext1",
        rule_id: "5710",
        rule_level: 10,
        rule_description: "SSH brute force",
        agent_wazuh_id: "001",
        agent_name: "web-1",
        occurred_at: "2026-08-01T00:00:00Z",
        synced_at: "2026-08-01T00:00:00Z",
        created_at: "2026-08-01T00:00:00Z",
      },
    ];
    mockGet.mockResolvedValue({ data: alerts });
    await expect(listGuardAlerts()).resolves.toEqual(alerts);
    expect(mockGet).toHaveBeenCalledWith("/api/guard/alerts", {
      params: { limit: 50 },
    });
  });

  it("listGuardAlerts forwards a custom limit", async () => {
    mockGet.mockResolvedValue({ data: [] });
    await expect(listGuardAlerts(10)).resolves.toEqual([]);
    expect(mockGet).toHaveBeenCalledWith("/api/guard/alerts", {
      params: { limit: 10 },
    });
  });

  it("createEnrollToken POSTs a label", async () => {
    mockPost.mockResolvedValue({
      data: { ...enrollToken, token: "enroll-secret" },
    });
    await expect(createEnrollToken("web-1")).resolves.toMatchObject({
      token: "enroll-secret",
    });
    expect(mockPost).toHaveBeenCalledWith("/api/guard/enroll-tokens", {
      label: "web-1",
    });
  });

  it("createEnrollToken sends undefined for an empty label", async () => {
    mockPost.mockResolvedValue({
      data: { ...enrollToken, token: "enroll-secret" },
    });
    await createEnrollToken("");
    expect(mockPost).toHaveBeenCalledWith("/api/guard/enroll-tokens", {
      label: undefined,
    });
  });

  it("listEnrollTokens GETs /api/guard/enroll-tokens", async () => {
    mockGet.mockResolvedValue({ data: [enrollToken] });
    await expect(listEnrollTokens()).resolves.toEqual([enrollToken]);
    expect(mockGet).toHaveBeenCalledWith("/api/guard/enroll-tokens");
  });

  it("revokeEnrollToken DELETEs by token id", async () => {
    mockDelete.mockResolvedValue({});
    await expect(revokeEnrollToken("et1")).resolves.toBeUndefined();
    expect(mockDelete).toHaveBeenCalledWith("/api/guard/enroll-tokens/et1");
  });

  it("linkGuardAgentAsset PATCHes the asset link", async () => {
    mockPatch.mockResolvedValue({ data: { ...agent, asset_id: "a1" } });
    await expect(linkGuardAgentAsset("ag1", "a1")).resolves.toMatchObject({
      asset_id: "a1",
    });
    expect(mockPatch).toHaveBeenCalledWith("/api/guard/agents/ag1/asset", {
      asset_id: "a1",
    });
  });

  it("linkGuardAgentAsset can unlink with null", async () => {
    mockPatch.mockResolvedValue({ data: agent });
    await linkGuardAgentAsset("ag1", null);
    expect(mockPatch).toHaveBeenCalledWith("/api/guard/agents/ag1/asset", {
      asset_id: null,
    });
  });

  it("issueHostAgentToken POSTs to the host-token endpoint", async () => {
    mockPost.mockResolvedValue({
      data: { agent_id: "ag1", token: "host-secret" },
    });
    await expect(issueHostAgentToken("ag1")).resolves.toEqual({
      agent_id: "ag1",
      token: "host-secret",
    });
    expect(mockPost).toHaveBeenCalledWith("/api/guard/agents/ag1/host-token");
  });

  it("disableGuardAgent POSTs to the disable endpoint", async () => {
    mockPost.mockResolvedValue({});
    await expect(disableGuardAgent("ag1")).resolves.toBeUndefined();
    expect(mockPost).toHaveBeenCalledWith("/api/guard/agents/ag1/disable");
  });

  it("syncGuard POSTs and returns the sync summary", async () => {
    const summary = { ok: true, agents: 3, alerts: 12 };
    mockPost.mockResolvedValue({ data: summary });
    await expect(syncGuard()).resolves.toEqual(summary);
    expect(mockPost).toHaveBeenCalledWith("/api/guard/sync");
  });

  it("canManageGuard allows owners and admins only", () => {
    expect(canManageGuard("owner")).toBe(true);
    expect(canManageGuard("admin")).toBe(true);
    expect(canManageGuard("member")).toBe(false);
    expect(canManageGuard(null)).toBe(false);
    expect(canManageGuard(undefined)).toBe(false);
  });

  it("propagates request failures", async () => {
    const error = new Error("guard disabled");
    mockGet.mockRejectedValue(error);
    await expect(getGuardStatus()).rejects.toBe(error);
  });
});
