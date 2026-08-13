import { describe, it, expect } from "vitest";
import { useScanError } from "@/hooks/useScanError";

describe("useScanError", () => {
  const { handleScanError } = { handleScanError: useScanError() };

  it("returns detail from Axios error response", () => {
    const error = {
      isAxiosError: true,
      response: { data: { detail: "Not enough credits" } },
    };
    expect(handleScanError(error)).toBe("Not enough credits");
  });

  it("returns CDN hint when Axios error has no response", () => {
    const error = { isAxiosError: true };
    expect(handleScanError(error)).toContain("interrupted");
  });

  it("returns timeout hint for 504 without detail", () => {
    const error = {
      isAxiosError: true,
      response: { status: 504, data: {} },
    };
    expect(handleScanError(error)).toContain("timed out");
  });

  it("returns size hint for 413", () => {
    const error = {
      isAxiosError: true,
      response: { status: 413, data: {} },
    };
    expect(handleScanError(error)).toContain("too large");
  });

  it("returns fallback for non-Axios Error", () => {
    expect(handleScanError(new Error("Network failure"))).toBe(
      "Failed to start scan. Check your connection.",
    );
  });

  it("returns fallback for null", () => {
    expect(handleScanError(null)).toBe(
      "Failed to start scan. Check your connection.",
    );
  });

  it("returns fallback for plain string", () => {
    expect(handleScanError("something broke")).toBe(
      "Failed to start scan. Check your connection.",
    );
  });
});
