import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/api/scans", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

import {
  createAiKey,
  getAiWallet,
  isAiDisabledError,
  listAiKeys,
  listAiModels,
  listAiUsage,
  revokeAiKey,
} from "@/api/ai";

const wallet = {
  organization_id: "org1",
  balance_idr: 250000,
  currency: "IDR",
};

const model = {
  public_id: "sinexis-small",
  price_idr_per_1k_in: 500,
  price_idr_per_1k_out: 1500,
  max_ctx: 128000,
  max_tokens_cap: 4096,
};

const key = {
  id: "k1",
  name: "CI",
  prefix: "sk_live_ab",
  is_active: true,
  rate_limit_rpm: 60,
  created_at: "2026-08-01T00:00:00Z",
  last_used_at: null,
};

const usage = {
  id: "u1",
  source: "chat",
  model_public_id: "sinexis-small",
  prompt_tokens: 120,
  completion_tokens: 80,
  billed_idr: 180,
  created_at: "2026-08-01T00:00:00Z",
};

describe("AI API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getAiWallet GETs /api/ai/wallet", async () => {
    mockGet.mockResolvedValue({ data: wallet });
    await expect(getAiWallet()).resolves.toEqual(wallet);
    expect(mockGet).toHaveBeenCalledWith("/api/ai/wallet");
  });

  it("listAiModels GETs /api/ai/models", async () => {
    const response = { items: [model], total: 1 };
    mockGet.mockResolvedValue({ data: response });
    await expect(listAiModels()).resolves.toEqual(response);
    expect(mockGet).toHaveBeenCalledWith("/api/ai/models");
  });

  it("listAiKeys GETs /api/ai/keys", async () => {
    const response = { items: [key], total: 1 };
    mockGet.mockResolvedValue({ data: response });
    await expect(listAiKeys()).resolves.toEqual(response);
    expect(mockGet).toHaveBeenCalledWith("/api/ai/keys");
  });

  it("createAiKey POSTs the key name", async () => {
    mockPost.mockResolvedValue({ data: { ...key, key: "sk_live_secret" } });
    await expect(createAiKey("CI")).resolves.toMatchObject({
      key: "sk_live_secret",
    });
    expect(mockPost).toHaveBeenCalledWith("/api/ai/keys", { name: "CI" });
  });

  it("revokeAiKey DELETEs by id", async () => {
    mockDelete.mockResolvedValue({ data: { ...key, is_active: false } });
    await expect(revokeAiKey("k1")).resolves.toMatchObject({
      is_active: false,
    });
    expect(mockDelete).toHaveBeenCalledWith("/api/ai/keys/k1");
  });

  it("listAiUsage GETs usage with the default limit", async () => {
    const response = { items: [usage], total: 1 };
    mockGet.mockResolvedValue({ data: response });
    await expect(listAiUsage()).resolves.toEqual(response);
    expect(mockGet).toHaveBeenCalledWith("/api/ai/usage", {
      params: { limit: 50 },
    });
  });

  it("listAiUsage forwards a custom limit", async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0 } });
    await expect(listAiUsage(5)).resolves.toEqual({ items: [], total: 0 });
    expect(mockGet).toHaveBeenCalledWith("/api/ai/usage", {
      params: { limit: 5 },
    });
  });

  it("isAiDisabledError is true only for a 404 response", () => {
    expect(isAiDisabledError({ response: { status: 404 } })).toBe(true);
    expect(isAiDisabledError({ response: { status: 500 } })).toBe(false);
    expect(isAiDisabledError({ response: undefined })).toBe(false);
    expect(isAiDisabledError(undefined)).toBe(false);
  });

  it("propagates request failures", async () => {
    const error = new Error("ai unavailable");
    mockGet.mockRejectedValue(error);
    await expect(getAiWallet()).rejects.toBe(error);
  });
});
