import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthLoading } from "@/components/AuthLoading";

describe("AuthLoading", () => {
  it("mirrors AuthLayout chrome without dashboard table skeleton", () => {
    render(<AuthLoading />);
    const region = screen.getByTestId("auth-loading");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveClass("min-h-dvh");
    expect(region).toHaveClass("items-start");
    expect(region.querySelector("header")).not.toBeInTheDocument();
    expect(region.querySelector("footer")).not.toBeInTheDocument();
    expect(region.querySelector("[data-slot='card'], .border-border")).toBeTruthy();
    expect(region.querySelectorAll(".animate-pulse").length).toBeGreaterThan(6);
  });

  it("uses the same max-width as login/register AuthLayout", () => {
    render(<AuthLoading maxWidth="lg" />);
    const region = screen.getByTestId("auth-loading");
    expect(region.firstElementChild).toHaveClass("max-w-2xl");
  });
});
