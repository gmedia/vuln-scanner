import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockPut = vi.fn();
const mockPost = vi.fn();

vi.mock("@/api/scans", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

import {
  createHppCost,
  getHppOverhead,
  getHppRates,
  getHppReport,
  getPricing,
  listHppCosts,
  normalizePricingList,
  quoteHpp,
  resendVerification,
  updateHppOverhead,
  updateHppRate,
  type PricingItem,
} from "@/api/admin";

const sample: PricingItem[] = [
  {
    id: "1",
    scan_type: "ip",
    credit_cost: 1,
    updated_at: "2025-06-01T00:00:00Z",
  },
];

describe("normalizePricingList", () => {
  it("returns bare arrays unchanged", () => {
    expect(normalizePricingList(sample)).toEqual(sample);
  });

  it("unwraps { items } responses", () => {
    expect(normalizePricingList({ items: sample })).toEqual(sample);
  });

  it("returns empty array for nullish or malformed payloads", () => {
    expect(normalizePricingList(null)).toEqual([]);
    expect(normalizePricingList(undefined)).toEqual([]);
    expect(
      normalizePricingList({ items: null as unknown as PricingItem[] }),
    ).toEqual([]);
  });
});

describe("getPricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes { items } from the admin pricing endpoint", async () => {
    mockGet.mockResolvedValue({ data: { items: sample } });
    await expect(getPricing()).resolves.toEqual(sample);
    expect(mockGet).toHaveBeenCalledWith("/api/admin/pricing");
  });

  it("accepts a bare array response", async () => {
    mockGet.mockResolvedValue({ data: sample });
    await expect(getPricing()).resolves.toEqual(sample);
  });
});

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
        sku_estimates: [],
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

  it("quoteHpp posts spec and jobs", async () => {
    mockPost.mockResolvedValue({
      data: {
        provider: "tencent-cvm",
        region: "jakarta",
        monthly_compute_idr: 568750,
        monthly_power_idr: 1,
        monthly_total_idr: 568751,
        total_jobs: 170,
        breakeven_unit_idr: 4000,
        overhead_pool_idr: 1_068_751,
        total_hpp_idr: 315000,
        total_fully_loaded_hpp_idr: 1_383_751,
        breakeven_pct_of_list_basic: 1.3,
        breakeven_pct_of_list_pro: 0.6,
        breakeven_pct_of_list_multi: 0.2,
        lines: [],
        note: "Server price only",
      },
    });
    const body = {
      provider: "tencent-cvm",
      region: "jakarta",
      cpu_vcpu: 2,
      ram_gb: 4,
      monthly_instance_idr: 568750,
      jobs: { ip: 100, domain: 50, hostscan: 20 },
    };
    await expect(quoteHpp(body)).resolves.toMatchObject({
      provider: "tencent-cvm",
      total_jobs: 170,
    });
    expect(mockPost).toHaveBeenCalledWith("/api/admin/hpp/quote", body);
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
