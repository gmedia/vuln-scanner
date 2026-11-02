import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockPut = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/api/scans", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

import {
  createHppCost,
  createSkuTier,
  deactivateSkuTier,
  deleteSkuTier,
  getAdminSkuTiers,
  reactivateSkuTier,
  updateSkuTier,
  getHppOverhead,
  getHppRates,
  getHppReport,
  listHppCosts,
  resendVerification,
  updateHppOverhead,
  updateHppRate,
} from "@/api/admin";

describe("hpp admin api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getHppRates unwraps items", async () => {
    mockGet.mockResolvedValue({
      data: {
        items: [
          {
            key: "ip",
            amount_idr: 0,
            updated_at: "2026-08-01T00:00:00Z",
            updated_by: null,
          },
        ],
      },
    });
    await expect(getHppRates()).resolves.toEqual([
      {
        key: "ip",
        amount_idr: 0,
        updated_at: "2026-08-01T00:00:00Z",
        updated_by: null,
      },
    ]);
    expect(mockGet).toHaveBeenCalledWith("/api/admin/hpp");
  });

  it("updateHppRate puts amount_idr", async () => {
    mockPut.mockResolvedValue({
      data: {
        key: "ip",
        amount_idr: 1500,
        updated_at: "2026-08-01T00:00:00Z",
        updated_by: null,
      },
    });
    await expect(
      updateHppRate("ip", { amount_idr: 1500 }),
    ).resolves.toMatchObject({
      amount_idr: 1500,
    });
    expect(mockPut).toHaveBeenCalledWith("/api/admin/hpp/ip", {
      amount_idr: 1500,
    });
  });

  it("getHppReport passes from/to params", async () => {
    mockGet.mockResolvedValue({
      data: {
        from_date: "a",
        to_date: "b",
        lines: [],
        total_count: 0,
        total_hpp_idr: 0,
        line_margins: [],
      },
    });
    await getHppReport({ from: "2026-08-01", to: "2026-08-31" });
    expect(mockGet).toHaveBeenCalledWith("/api/admin/hpp/report", {
      params: { from: "2026-08-01", to: "2026-08-31" },
    });
  });

  it("getHppOverhead and updateHppOverhead", async () => {
    mockGet.mockResolvedValue({
      data: {
        amount_idr: 0,
        updated_at: "2026-08-01T00:00:00Z",
        updated_by: null,
      },
    });
    await expect(getHppOverhead()).resolves.toMatchObject({ amount_idr: 0 });
    expect(mockGet).toHaveBeenCalledWith("/api/admin/hpp/overhead");
    mockPut.mockResolvedValue({
      data: {
        amount_idr: 50000,
        updated_at: "2026-08-01T00:00:00Z",
        updated_by: null,
      },
    });
    await expect(
      updateHppOverhead({ amount_idr: 50000 }),
    ).resolves.toMatchObject({
      amount_idr: 50000,
    });
    expect(mockPut).toHaveBeenCalledWith("/api/admin/hpp/overhead", {
      amount_idr: 50000,
    });
  });

  it("listHppCosts and createHppCost", async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await expect(listHppCosts({ from: "2026-08-01" })).resolves.toEqual([]);
    expect(mockGet).toHaveBeenCalledWith("/api/admin/hpp/costs", {
      params: { from: "2026-08-01" },
    });
    mockPost.mockResolvedValue({
      data: {
        id: "c1",
        incurred_on: "2026-08-01T00:00:00Z",
        amount_idr: 40,
        category: "opex",
        note: "CF",
        created_at: "2026-08-01T00:00:00Z",
        created_by: null,
      },
    });
    await expect(
      createHppCost({
        incurred_on: "2026-08-01",
        amount_idr: 40,
        category: "opex",
        note: "CF",
      }),
    ).resolves.toMatchObject({ amount_idr: 40 });
    expect(mockPost).toHaveBeenCalledWith("/api/admin/hpp/costs", {
      incurred_on: "2026-08-01",
      amount_idr: 40,
      category: "opex",
      note: "CF",
    });
  });
});

describe("resendVerification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to admin resend-verification endpoint", async () => {
    mockPost.mockResolvedValue({
      data: { message: "Verification email has been sent.", email_sent: true },
    });
    await expect(resendVerification("user-1")).resolves.toEqual({
      message: "Verification email has been sent.",
      email_sent: true,
    });
    expect(mockPost).toHaveBeenCalledWith(
      "/api/admin/users/user-1/resend-verification",
    );
  });
});

describe("admin sku tier api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const tier = {
    code: "pro_plus",
    label: "Pro+",
    rank: 3,
    active: true,
    requestable: true,
    sales_led: false,
    is_default: false,
    bundle_idr: 1_800_000,
    limits: { scan: 4, host: 4, uptime: 80, guard: 4 },
    features: {
      allow_status_page: true,
      allow_custom_host: false,
      allow_waf_protect: true,
      allow_siem: false,
      billing_unrestricted: false,
      sales_led: false,
      requestable: true,
    },
    workspace_limits: { editor: null, viewer: null },
  };

  it("lists tiers from the admin endpoint", async () => {
    mockGet.mockResolvedValue({ data: [tier] });
    await expect(getAdminSkuTiers()).resolves.toEqual([tier]);
    expect(mockGet).toHaveBeenCalledWith("/api/admin/sku-tiers");
  });

  it("creates and updates a tier", async () => {
    mockPost.mockResolvedValue({ data: tier });
    mockPatch.mockResolvedValue({ data: tier });
    await expect(
      createSkuTier({ code: "pro_plus", label: "Pro+" }),
    ).resolves.toEqual(tier);
    expect(mockPost).toHaveBeenCalledWith("/api/admin/sku-tiers", {
      code: "pro_plus",
      label: "Pro+",
    });
    await expect(
      updateSkuTier("pro_plus", { rank: 3 }),
    ).resolves.toEqual(tier);
    expect(mockPatch).toHaveBeenCalledWith("/api/admin/sku-tiers/pro_plus", {
      rank: 3,
    });
  });

  it("deactivates, reactivates, and deletes a tier", async () => {
    mockPost.mockResolvedValue({ data: tier });
    mockDelete.mockResolvedValue({ data: undefined });
    await deactivateSkuTier("pro_plus");
    expect(mockPost).toHaveBeenCalledWith(
      "/api/admin/sku-tiers/pro_plus/deactivate",
    );
    await reactivateSkuTier("pro_plus");
    expect(mockPost).toHaveBeenCalledWith(
      "/api/admin/sku-tiers/pro_plus/reactivate",
    );
    await deleteSkuTier("pro_plus");
    expect(mockDelete).toHaveBeenCalledWith("/api/admin/sku-tiers/pro_plus");
  });
});
