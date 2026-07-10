import { describe, it, expect } from "vitest";
import { cn, isValidPort } from "@/lib/utils";

describe("cn", () => {
  it("returns a string", () => {
    const result = cn("px-4", "py-2");
    expect(typeof result).toBe("string");
  });

  it("merges Tailwind classes correctly (later wins)", () => {
    const result = cn("px-4", "px-6");
    expect(result).toBe("px-6");
  });

  it("handles array arguments", () => {
    const result = cn(["px-4", "py-2"], "bg-red-500");
    expect(result).toBe("px-4 py-2 bg-red-500");
  });

  it("handles object arguments with conditional classes", () => {
    const result = cn("px-4", {
      "bg-red-500": true,
      "text-white": false,
    });
    expect(result).toBe("px-4 bg-red-500");
  });

  it("returns empty string for no arguments", () => {
    const result = cn();
    expect(result).toBe("");
  });

  it("removes falsey values", () => {
    const result = cn("px-4", false, null, undefined, 0, "py-2");
    expect(result).toBe("px-4 py-2");
  });
});

describe("isValidPort", () => {
  it("accepts empty string", () => {
    expect(isValidPort("")).toBe(true);
  });

  it("accepts whitespace-only as empty", () => {
    expect(isValidPort("  ")).toBe(true);
  });

  it("accepts single port", () => {
    expect(isValidPort("22")).toBe(true);
  });

  it("accepts comma-separated ports", () => {
    expect(isValidPort("80,443,8080")).toBe(true);
  });

  it("rejects port 0", () => {
    expect(isValidPort("0")).toBe(false);
  });

  it("rejects port > 65535", () => {
    expect(isValidPort("65536")).toBe(false);
  });

  it("rejects comma-separated with invalid port", () => {
    expect(isValidPort("80,99999")).toBe(false);
  });

  it("accepts valid range", () => {
    expect(isValidPort("1-1000")).toBe(true);
  });

  it("accepts single-port range", () => {
    expect(isValidPort("80-80")).toBe(true);
  });

  it("rejects range where start > end", () => {
    expect(isValidPort("100-50")).toBe(false);
  });

  it("rejects range starting at 0", () => {
    expect(isValidPort("0-100")).toBe(false);
  });

  it("rejects range ending above 65535", () => {
    expect(isValidPort("1000-70000")).toBe(false);
  });

  it("rejects garbage input", () => {
    expect(isValidPort("abc")).toBe(false);
  });

  it("rejects mixed letters and numbers", () => {
    expect(isValidPort("80-abc")).toBe(false);
  });

  it("rejects comma-separated with non-numeric value", () => {
    expect(isValidPort("1,2,three")).toBe(false);
  });

  it("trims whitespace from input", () => {
    expect(isValidPort(" 80 ")).toBe(true);
  });
});
