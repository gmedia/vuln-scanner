import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LandingLoading } from "@/components/LandingLoading";

describe("LandingLoading", () => {
  it("mirrors landing chrome without dashboard table skeleton", () => {
    render(<LandingLoading />);
    const region = screen.getByTestId("landing-loading");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveClass("min-h-dvh");
    expect(region.querySelector("header")).toHaveClass("border-b");
    expect(region.querySelector("header > div")).toHaveClass("h-12");
    expect(region.querySelector("footer")).toBeInTheDocument();
    expect(region.querySelectorAll(".animate-pulse").length).toBeGreaterThan(8);
  });
});
