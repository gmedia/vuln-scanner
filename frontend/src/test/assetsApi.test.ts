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
  createAsset,
  createAssetSchedule,
  deleteAsset,
  fetchAssetPack,
  fetchAssetPackHtml,
  fetchTagColors,
  isTagColorValue,
  listAssets,
  patchTagColors,
  updateAsset,
} from "@/api/assets";

const asset = {
  id: "a1",
  organization_id: "org1",
  name: "Production web",
  scan_type: "domain",
  target: "acme.test",
  notes: "primary site",
  tags: ["prod", "web"],
  created_by: "u1",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  schedule_id: null,
  sku: "host_pro",
  sku_limit: 10,
};

const schedule = {
  id: "s1",
  asset_id: "a1",
  cadence: "weekly",
  timezone: "Asia/Jakarta",
  enabled: true,
  next_run_at: "2026-08-08T00:00:00Z",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

describe("assets API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listAssets GETs /api/assets without params when no tag", async () => {
    mockGet.mockResolvedValue({ data: [asset] });
    await expect(listAssets()).resolves.toEqual([asset]);
    expect(mockGet).toHaveBeenCalledWith("/api/assets", { params: undefined });
  });

  it("listAssets passes the tag filter", async () => {
    mockGet.mockResolvedValue({ data: [] });
    await expect(listAssets("prod")).resolves.toEqual([]);
    expect(mockGet).toHaveBeenCalledWith("/api/assets", {
      params: { tag: "prod" },
    });
  });

  it("createAsset POSTs the create payload", async () => {
    mockPost.mockResolvedValue({ data: asset });
    const payload = {
      name: "Production web",
      scan_type: "domain" as const,
      target: "acme.test",
      tags: ["prod"],
    };
    await expect(createAsset(payload)).resolves.toEqual(asset);
    expect(mockPost).toHaveBeenCalledWith("/api/assets", payload);
  });

  it("isTagColorValue accepts named colors and lowercase hex", () => {
    expect(isTagColorValue("green")).toBe(true);
    expect(isTagColorValue("#1a2b3c")).toBe(true);
    expect(isTagColorValue("chartreuse")).toBe(false);
    expect(isTagColorValue("#1A2B3C")).toBe(false);
    expect(isTagColorValue("#abc")).toBe(false);
  });

  it("fetchTagColors GETs and normalises/drops invalid colors", async () => {
    mockGet.mockResolvedValue({
      data: {
        colors: {
          prod: " Green ",
          db: " #AABBCC ",
          legacy: "neon",
          empty: "",
        },
      },
    });
    await expect(fetchTagColors()).resolves.toEqual({
      prod: "green",
      db: "#aabbcc",
    });
    expect(mockGet).toHaveBeenCalledWith("/api/assets/tag-colors");
  });

  it("fetchTagColors tolerates a missing colors map", async () => {
    mockGet.mockResolvedValue({ data: {} });
    await expect(fetchTagColors()).resolves.toEqual({});
  });

  it("patchTagColors PATCHes the colors map and normalises the response", async () => {
    mockPatch.mockResolvedValue({
      data: { colors: { prod: "blue", bad: "nope" } },
    });
    await expect(
      patchTagColors({ prod: "blue", web: "#00ff00" }),
    ).resolves.toEqual({ prod: "blue" });
    expect(mockPatch).toHaveBeenCalledWith("/api/assets/tag-colors", {
      colors: { prod: "blue", web: "#00ff00" },
    });
  });

  it("updateAsset PATCHes by id", async () => {
    mockPatch.mockResolvedValue({ data: asset });
    const payload = { name: "Renamed", tags: ["prod"] };
    await expect(updateAsset("a1", payload)).resolves.toEqual(asset);
    expect(mockPatch).toHaveBeenCalledWith("/api/assets/a1", payload);
  });

  it("deleteAsset DELETEs by id", async () => {
    mockDelete.mockResolvedValue({});
    await expect(deleteAsset("a1")).resolves.toBeUndefined();
    expect(mockDelete).toHaveBeenCalledWith("/api/assets/a1");
  });

  it("fetchAssetPack GETs the pack summary", async () => {
    const pack = {
      organization_id: "org1",
      sku: "host_pro",
      sku_limit: 10,
      count: 1,
      assets: [
        {
          id: "a1",
          name: "Production web",
          scan_type: "domain",
          target: "acme.test",
          schedule_id: "s1",
        },
      ],
    };
    mockGet.mockResolvedValue({ data: pack });
    await expect(fetchAssetPack()).resolves.toEqual(pack);
    expect(mockGet).toHaveBeenCalledWith("/api/assets/pack");
  });

  it("fetchAssetPackHtml requests a blob with format and lang", async () => {
    const blob = new Blob(["<html></html>"], { type: "text/html" });
    mockGet.mockResolvedValue({ data: blob });
    await expect(fetchAssetPackHtml("id")).resolves.toBe(blob);
    expect(mockGet).toHaveBeenCalledWith("/api/assets/pack", {
      params: { format: "html", lang: "id" },
      responseType: "blob",
    });
  });

  it("fetchAssetPackHtml omits lang when not provided", async () => {
    const blob = new Blob(["<html></html>"], { type: "text/html" });
    mockGet.mockResolvedValue({ data: blob });
    await expect(fetchAssetPackHtml()).resolves.toBe(blob);
    expect(mockGet).toHaveBeenCalledWith("/api/assets/pack", {
      params: { format: "html", lang: undefined },
      responseType: "blob",
    });
  });

  it("createAssetSchedule POSTs to the asset schedules endpoint", async () => {
    mockPost.mockResolvedValue({ data: schedule });
    const payload = {
      cadence: "weekly" as const,
      timezone: "Asia/Jakarta",
      enabled: true,
    };
    await expect(createAssetSchedule("a1", payload)).resolves.toEqual(schedule);
    expect(mockPost).toHaveBeenCalledWith("/api/assets/a1/schedules", payload);
  });

  it("propagates request failures", async () => {
    const error = new Error("asset list failed");
    mockGet.mockRejectedValue(error);
    await expect(listAssets()).rejects.toBe(error);
  });
});
