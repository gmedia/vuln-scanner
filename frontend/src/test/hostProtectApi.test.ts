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
  createHostSite,
  deleteHostSite,
  enqueueHostScan,
  ignoreHostHit,
  isHostProtectDisabledError,
  listHostHits,
  listHostScans,
  listHostSites,
  mapHostError,
  quarantineHostHit,
  restoreHostHit,
  updateHostSite,
} from "@/api/hostProtect";

const site = {
  id: "site1",
  organization_id: "org1",
  guard_agent_id: "ag1",
  asset_id: "a1",
  name: "Acme WordPress",
  root_path: "/var/www/acme",
  cms_hint: "wordpress",
  enabled: true,
  auto_quarantine: false,
  scan_interval: "daily" as const,
  created_by: "u1",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  sku: "host_pro",
  sku_limit: 10,
};

const scan = {
  id: "scan1",
  organization_id: "org1",
  site_id: "site1",
  status: "queued",
  trigger: "manual",
  started_at: null,
  finished_at: null,
  error: null,
  hit_count: 0,
  created_at: "2026-08-01T00:00:00Z",
};

const hit = {
  id: "hit1",
  organization_id: "org1",
  site_id: "site1",
  scan_id: "scan1",
  rel_path: "wp-content/uploads/shell.php",
  class: "webshell",
  engine: "yara",
  rule_id: "php_webshell",
  status: "detected",
  sha256: "abc123",
  first_seen_at: "2026-08-01T00:00:00Z",
  last_seen_at: "2026-08-01T00:00:00Z",
};

describe("host protect API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updateHostSite PATCHes by site id", async () => {
    mockPatch.mockResolvedValue({ data: { ...site, enabled: false } });
    const payload = {
      enabled: false,
      scan_interval: "hourly" as const,
      auto_quarantine: true,
    };
    await expect(updateHostSite("site1", payload)).resolves.toMatchObject({
      enabled: false,
    });
    expect(mockPatch).toHaveBeenCalledWith("/api/host/sites/site1", payload);
  });

  it("listHostSites GETs /api/host/sites", async () => {
    mockGet.mockResolvedValue({ data: [site] });
    await expect(listHostSites()).resolves.toEqual([site]);
    expect(mockGet).toHaveBeenCalledWith("/api/host/sites");
  });

  it("createHostSite POSTs the create payload", async () => {
    mockPost.mockResolvedValue({ data: site });
    const payload = {
      name: "Acme WordPress",
      guard_agent_id: "ag1",
      root_path: "/var/www/acme",
      cms_hint: "wordpress" as const,
      scan_interval: "daily" as const,
    };
    await expect(createHostSite(payload)).resolves.toEqual(site);
    expect(mockPost).toHaveBeenCalledWith("/api/host/sites", payload);
  });

  it("deleteHostSite DELETEs by id", async () => {
    mockDelete.mockResolvedValue({});
    await expect(deleteHostSite("site1")).resolves.toBeUndefined();
    expect(mockDelete).toHaveBeenCalledWith("/api/host/sites/site1");
  });

  it("enqueueHostScan POSTs to the site scan endpoint", async () => {
    mockPost.mockResolvedValue({ data: scan });
    await expect(enqueueHostScan("site1")).resolves.toEqual(scan);
    expect(mockPost).toHaveBeenCalledWith("/api/host/sites/site1/scan");
  });

  it("listHostScans GETs scans for the site", async () => {
    mockGet.mockResolvedValue({ data: [scan] });
    await expect(listHostScans("site1")).resolves.toEqual([scan]);
    expect(mockGet).toHaveBeenCalledWith("/api/host/sites/site1/scans");
  });

  it("listHostHits GETs hits with filters", async () => {
    mockGet.mockResolvedValue({ data: [hit] });
    const params = { site_id: "site1", status: "detected", class: "webshell" };
    await expect(listHostHits(params)).resolves.toEqual([hit]);
    expect(mockGet).toHaveBeenCalledWith("/api/host/hits", { params });
  });

  it("listHostHits forwards undefined params as-is", async () => {
    mockGet.mockResolvedValue({ data: [] });
    await expect(listHostHits()).resolves.toEqual([]);
    expect(mockGet).toHaveBeenCalledWith("/api/host/hits", {
      params: undefined,
    });
  });

  it("quarantineHostHit POSTs to the quarantine endpoint", async () => {
    mockPost.mockResolvedValue({ data: { ...hit, status: "quarantined" } });
    await expect(quarantineHostHit("hit1")).resolves.toMatchObject({
      status: "quarantined",
    });
    expect(mockPost).toHaveBeenCalledWith("/api/host/hits/hit1/quarantine");
  });

  it("restoreHostHit POSTs to the restore endpoint", async () => {
    mockPost.mockResolvedValue({ data: { ...hit, status: "restored" } });
    await expect(restoreHostHit("hit1")).resolves.toMatchObject({
      status: "restored",
    });
    expect(mockPost).toHaveBeenCalledWith("/api/host/hits/hit1/restore");
  });

  it("ignoreHostHit POSTs to the ignore endpoint", async () => {
    mockPost.mockResolvedValue({ data: { ...hit, status: "ignored" } });
    await expect(ignoreHostHit("hit1")).resolves.toMatchObject({
      status: "ignored",
    });
    expect(mockPost).toHaveBeenCalledWith("/api/host/hits/hit1/ignore");
  });

  it("isHostProtectDisabledError is true only for a 404 response", () => {
    expect(isHostProtectDisabledError({ response: { status: 404 } })).toBe(
      true,
    );
    expect(isHostProtectDisabledError({ response: { status: 403 } })).toBe(
      false,
    );
    expect(isHostProtectDisabledError(null)).toBe(false);
    expect(isHostProtectDisabledError(undefined)).toBe(false);
  });

  it("mapHostError maps SKU limit errors", () => {
    expect(mapHostError("Asset limit reached")).toBe("limit");
    expect(mapHostError("SITE LIMIT exceeded")).toBe("limit");
  });

  it("mapHostError passes other messages through unchanged", () => {
    expect(mapHostError("Root path not readable")).toBe(
      "Root path not readable",
    );
    expect(mapHostError("")).toBe("");
  });

  it("propagates request failures", async () => {
    const error = new Error("host protect disabled");
    mockGet.mockRejectedValue(error);
    await expect(listHostSites()).rejects.toBe(error);
  });
});
