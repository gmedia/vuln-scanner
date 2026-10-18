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
  createMonitor,
  deleteMonitor,
  getMonitor,
  getMonitorStats,
  listEvents,
  listMonitors,
  listSamples,
  pauseMonitor,
  rotateHeartbeatToken,
  updateMonitor,
} from "@/api/uptime";

const monitor = {
  id: "m1",
  organization_id: "org1",
  name: "API health",
  check_type: "http",
  target: "https://acme.test/health",
  interval_seconds: 60,
  timeout_seconds: 10,
  expect_status: 200,
  keyword: null,
  keyword_invert: false,
  enabled: true,
  state: "up",
  consecutive_fails: 0,
  last_checked_at: "2026-08-01T00:00:00Z",
  last_status_code: 200,
  last_latency_ms: 42,
  last_error: null,
  next_check_at: "2026-08-01T00:01:00Z",
  notify_email: "ops@acme.test",
  asset_id: null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  sku: "host_pro",
  sku_limit: 10,
  uptime_24h: 99.9,
};

describe("uptime API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listMonitors GETs /api/uptime/monitors", async () => {
    mockGet.mockResolvedValue({ data: [monitor] });
    await expect(listMonitors()).resolves.toEqual([monitor]);
    expect(mockGet).toHaveBeenCalledWith("/api/uptime/monitors");
  });

  it("createMonitor POSTs the create payload", async () => {
    mockPost.mockResolvedValue({ data: monitor });
    const payload = {
      name: "API health",
      check_type: "http" as const,
      target: "https://acme.test/health",
      interval_seconds: 60,
      expect_status: 200,
      notify_email: "ops@acme.test",
    };
    await expect(createMonitor(payload)).resolves.toEqual(monitor);
    expect(mockPost).toHaveBeenCalledWith("/api/uptime/monitors", payload);
  });

  it("updateMonitor PATCHes by id", async () => {
    mockPatch.mockResolvedValue({ data: monitor });
    const payload = { name: "API health v2", enabled: false };
    await expect(updateMonitor("m1", payload)).resolves.toEqual(monitor);
    expect(mockPatch).toHaveBeenCalledWith("/api/uptime/monitors/m1", payload);
  });

  it("deleteMonitor DELETEs by id", async () => {
    mockDelete.mockResolvedValue({});
    await expect(deleteMonitor("m1")).resolves.toBeUndefined();
    expect(mockDelete).toHaveBeenCalledWith("/api/uptime/monitors/m1");
  });

  it("pauseMonitor POSTs to the pause endpoint", async () => {
    mockPost.mockResolvedValue({ data: { ...monitor, enabled: false } });
    await expect(pauseMonitor("m1")).resolves.toMatchObject({ enabled: false });
    expect(mockPost).toHaveBeenCalledWith("/api/uptime/monitors/m1/pause");
  });

  it("rotateHeartbeatToken POSTs to the rotate endpoint", async () => {
    mockPost.mockResolvedValue({
      data: {
        ...monitor,
        check_type: "heartbeat",
        heartbeat_token: "new-token",
      },
    });
    await expect(rotateHeartbeatToken("m1")).resolves.toMatchObject({
      heartbeat_token: "new-token",
    });
    expect(mockPost).toHaveBeenCalledWith(
      "/api/uptime/monitors/m1/rotate-token",
    );
  });

  it("getMonitor GETs by id", async () => {
    mockGet.mockResolvedValue({ data: monitor });
    await expect(getMonitor("m1")).resolves.toEqual(monitor);
    expect(mockGet).toHaveBeenCalledWith("/api/uptime/monitors/m1");
  });

  it("listSamples GETs samples with window params", async () => {
    const samples = {
      items: [
        {
          id: "s1",
          checked_at: "2026-08-01T00:00:00Z",
          ok: true,
          latency_ms: 42,
          status_code: 200,
          error: null,
        },
      ],
      total: 1,
    };
    mockGet.mockResolvedValue({ data: samples });
    const params = { from: "2026-08-01", until: "2026-08-02", limit: 100 };
    await expect(listSamples("m1", params)).resolves.toEqual(samples);
    expect(mockGet).toHaveBeenCalledWith("/api/uptime/monitors/m1/samples", {
      params,
    });
  });

  it("listSamples forwards undefined params as-is", async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });
    await expect(listSamples("m1")).resolves.toEqual({ items: [], total: 0 });
    expect(mockGet).toHaveBeenCalledWith("/api/uptime/monitors/m1/samples", {
      params: undefined,
    });
  });

  it("listEvents GETs events with limit params", async () => {
    const events = [
      {
        id: "e1",
        from_state: "up",
        to_state: "down",
        at: "2026-08-01T00:00:00Z",
        notified: true,
        detail: "timeout",
      },
    ];
    mockGet.mockResolvedValue({ data: events });
    const params = { from: "2026-08-01", until: "2026-08-02", limit: 25 };
    await expect(listEvents("m1", params)).resolves.toEqual(events);
    expect(mockGet).toHaveBeenCalledWith("/api/uptime/monitors/m1/events", {
      params,
    });
  });

  it("getMonitorStats GETs stats with window params", async () => {
    const stats = {
      uptime_pct: 99.5,
      ok_count: 199,
      total_count: 200,
      from_at: "2026-08-01T00:00:00Z",
      until_at: "2026-08-02T00:00:00Z",
    };
    mockGet.mockResolvedValue({ data: stats });
    const params = { from: "2026-08-01", until: "2026-08-02" };
    await expect(getMonitorStats("m1", params)).resolves.toEqual(stats);
    expect(mockGet).toHaveBeenCalledWith("/api/uptime/monitors/m1/stats", {
      params,
    });
  });

  it("propagates request failures", async () => {
    const error = new Error("uptime unavailable");
    mockGet.mockRejectedValue(error);
    await expect(getMonitor("m1")).rejects.toBe(error);
  });
});
