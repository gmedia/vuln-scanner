import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();

vi.mock("@/api/scans", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
  },
}));

import {
  fetchHostWafSnippet,
  isHostWafDisabledError,
  listHostWafEvents,
  listHostWafPolicies,
  simulateHostWaf,
  upsertHostWafPolicy,
} from "@/api/hostWaf";

const policy = {
  id: "p1",
  organization_id: "org1",
  site_id: "site1",
  mode: "detect" as const,
  engine: "modsecurity",
  paranoia: 2,
  updated_by: "u1",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  site_name: "Acme WordPress",
};

const event = {
  id: "ev1",
  organization_id: "org1",
  site_id: "site1",
  policy_id: "p1",
  action: "block" as const,
  rule_id: "942100",
  method: "POST",
  path: "/wp-login.php",
  http_status: 403,
  created_at: "2026-08-01T00:00:00Z",
};

describe("host WAF API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listHostWafPolicies GETs /api/host/waf/policies", async () => {
    mockGet.mockResolvedValue({ data: [policy] });
    await expect(listHostWafPolicies()).resolves.toEqual([policy]);
    expect(mockGet).toHaveBeenCalledWith("/api/host/waf/policies");
  });

  it("upsertHostWafPolicy PUTs explicit engine and paranoia", async () => {
    mockPut.mockResolvedValue({ data: policy });
    await expect(
      upsertHostWafPolicy("site1", {
        mode: "protect",
        engine: "modsecurity",
        paranoia: 2,
      }),
    ).resolves.toEqual(policy);
    expect(mockPut).toHaveBeenCalledWith("/api/host/waf/sites/site1/policy", {
      mode: "protect",
      engine: "modsecurity",
      paranoia: 2,
    });
  });

  it("upsertHostWafPolicy defaults engine to mock and paranoia to 1", async () => {
    mockPut.mockResolvedValue({ data: policy });
    await upsertHostWafPolicy("site1", { mode: "off" });
    expect(mockPut).toHaveBeenCalledWith("/api/host/waf/sites/site1/policy", {
      mode: "off",
      engine: "mock",
      paranoia: 1,
    });
  });

  it("listHostWafEvents defaults to page 1 / limit 20 without a site", async () => {
    const response = {
      items: [event],
      total: 1,
      page: 1,
      limit: 20,
      pages: 1,
    };
    mockGet.mockResolvedValue({ data: response });
    await expect(listHostWafEvents()).resolves.toEqual(response);
    expect(mockGet).toHaveBeenCalledWith("/api/host/waf/events", {
      params: { page: 1, limit: 20 },
    });
  });

  it("listHostWafEvents forwards site id and pagination", async () => {
    const response = { items: [], total: 0, page: 3, limit: 5, pages: 0 };
    mockGet.mockResolvedValue({ data: response });
    await expect(
      listHostWafEvents("site1", { page: 3, limit: 5 }),
    ).resolves.toEqual(response);
    expect(mockGet).toHaveBeenCalledWith("/api/host/waf/events", {
      params: { site_id: "site1", page: 3, limit: 5 },
    });
  });

  it("simulateHostWaf POSTs to the simulate endpoint", async () => {
    mockPost.mockResolvedValue({ data: event });
    await expect(simulateHostWaf("site1")).resolves.toEqual(event);
    expect(mockPost).toHaveBeenCalledWith("/api/host/waf/sites/site1/simulate");
  });

  it("fetchHostWafSnippet GETs the site snippet", async () => {
    const snippet = {
      site_id: "site1",
      engine: "modsecurity",
      mode: "protect",
      filename: "acme-waf.conf",
      content: "SecRuleEngine On",
    };
    mockGet.mockResolvedValue({ data: snippet });
    await expect(fetchHostWafSnippet("site1")).resolves.toEqual(snippet);
    expect(mockGet).toHaveBeenCalledWith("/api/host/waf/sites/site1/snippet");
  });

  it("isHostWafDisabledError is true only for a 404 response", () => {
    expect(isHostWafDisabledError({ response: { status: 404 } })).toBe(true);
    expect(isHostWafDisabledError({ response: { status: 502 } })).toBe(false);
    expect(isHostWafDisabledError({})).toBe(false);
    expect(isHostWafDisabledError(undefined)).toBe(false);
  });

  it("propagates request failures", async () => {
    const error = new Error("waf disabled");
    mockGet.mockRejectedValue(error);
    await expect(listHostWafPolicies()).rejects.toBe(error);
  });
});
