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
  getPricing,
  normalizePricingList,
  resendVerification,
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
