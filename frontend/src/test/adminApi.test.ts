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
  getHppOverhead,
  getHppRates,
  getHppReport,
  getPricing,
  normalizePricingList,
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
