import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/Badge";

describe("Badge", () => {
  it("renders with default variant", () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText("Default");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-muted");
  });

  it.each([
    ["critical", "bg-red-600/20"],
    ["high", "bg-orange-500/20"],
    ["medium", "bg-yellow-500/20"],
    ["low", "bg-blue-500/20"],
    ["info", "bg-gray-500/20"],
    ["success", "bg-primary/20"],
    ["completed", "bg-primary/20"],
    ["failed", "bg-red-600/20"],
    ["running", "bg-blue-500/20"],
  ] as const)("renders %s variant with correct styling", (variant, expectedClass) => {
    render(<Badge variant={variant}>{variant}</Badge>);
    const badge = screen.getByText(variant);
    expect(badge).toHaveClass(expectedClass);
  });

  it("applies custom className", () => {
    render(<Badge className="custom-class">Custom</Badge>);
    const badge = screen.getByText("Custom");
    expect(badge).toHaveClass("custom-class");
  });

  it("passes additional HTML attributes", () => {
    render(<Badge data-testid="test-badge">Attributed</Badge>);
    const badge = screen.getByTestId("test-badge");
    expect(badge).toBeInTheDocument();
  });
});
