import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

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
