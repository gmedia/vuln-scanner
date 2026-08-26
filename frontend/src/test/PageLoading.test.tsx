import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageLoading } from "@/components/PageLoading";

describe("PageLoading", () => {
  it("exposes a busy status region without Loading... copy", () => {
    render(<PageLoading />);
    const region = screen.getByTestId("page-loading");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).not.toHaveTextContent("Loading...");
    expect(region.querySelectorAll(".animate-pulse").length).toBeGreaterThan(3);
  });
});
