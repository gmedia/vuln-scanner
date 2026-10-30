import { describe, it, expect } from "vitest";
import {
  formatPricePerTokens,
  formatUsdPer1m,
  idrPer1kToUsdPer1m,
  parsePriceInput,
  usdPer1mToIdrPer1k,
} from "@/components/admin/aiFormat";

describe("idrPer1kToUsdPer1m", () => {
  it("converts Rp 2.445 / 1K to USD / 1M at 16.300", () => {
    expect(idrPer1kToUsdPer1m(2445, 16300)).toBeCloseTo(150, 6);
  });

  it("returns 0 when the rate is not positive", () => {
    expect(idrPer1kToUsdPer1m(2445, 0)).toBe(0);
    expect(idrPer1kToUsdPer1m(2445, -1)).toBe(0);
  });
});

describe("usdPer1mToIdrPer1k", () => {
  it("converts $150 / 1M to Rp 2.445 / 1K at 16.300", () => {
    expect(usdPer1mToIdrPer1k(150, 16300)).toBe(2445);
  });

  it("rounds to whole IDR, losing sub-rupiah precision", () => {
    expect(usdPer1mToIdrPer1k(0.15, 16300)).toBe(2);
  });

  it("returns 0 when the rate is not positive", () => {
    expect(usdPer1mToIdrPer1k(150, 0)).toBe(0);
    expect(usdPer1mToIdrPer1k(150, -1)).toBe(0);
  });
});

describe("formatUsdPer1m", () => {
  it("formats whole-dollar prices with two decimals", () => {
    expect(formatUsdPer1m(150)).toBe("$150.00");
  });

  it("formats sub-dollar prices without extra zeros", () => {
    expect(formatUsdPer1m(0.15)).toBe("$0.15");
  });
});

describe("formatPricePerTokens", () => {
  it("renders an em dash for a missing IDR price", () => {
    expect(formatPricePerTokens(null, "idr_1k", 16300)).toBe("—");
    expect(formatPricePerTokens(undefined, "usd_1m", 16300)).toBe("—");
  });

  it("renders the stored IDR price in idr_1k mode", () => {
    expect(formatPricePerTokens(1000, "idr_1k", 16300)).toBe("Rp 1.000");
  });

  it("converts the stored IDR price in usd_1m mode", () => {
    expect(formatPricePerTokens(1000, "usd_1m", 16300)).toBe("$61.35");
  });
});

describe("parsePriceInput", () => {
  it("parses plain and decimal prices", () => {
    expect(parsePriceInput("150")).toBe(150);
    expect(parsePriceInput("0.15")).toBe(0.15);
  });

  it("rejects empty, non-numeric and negative input", () => {
    expect(parsePriceInput("")).toBeNull();
    expect(parsePriceInput("   ")).toBeNull();
    expect(parsePriceInput("abc")).toBeNull();
    expect(parsePriceInput("-1")).toBeNull();
  });

  it("rejects Infinity", () => {
    expect(parsePriceInput("Infinity")).toBeNull();
  });
});
