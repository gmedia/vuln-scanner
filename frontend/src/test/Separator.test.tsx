import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Separator } from "@/components/ui/Separator";

describe("Separator", () => {
  it("renders with horizontal orientation by default", () => {
    const { container } = render(<Separator />);
    const separator = container.querySelector('[data-orientation="horizontal"]');
    expect(separator).toBeInTheDocument();
    expect(separator).toHaveAttribute("data-orientation", "horizontal");
  });

  it("renders with vertical orientation", () => {
    const { container } = render(<Separator orientation="vertical" />);
    const separator = container.querySelector('[data-orientation="vertical"]');
    expect(separator).toBeInTheDocument();
    expect(separator).toHaveAttribute("data-orientation", "vertical");
  });

  it("applies custom className", () => {
    const { container } = render(<Separator className="my-separator" />);
    const separator = container.querySelector('[data-orientation="horizontal"]');
    expect(separator).toHaveClass("my-separator");
  });

  it("sets decorative prop by default", () => {
    const { container } = render(<Separator />);
    const separator = container.querySelector('[data-orientation="horizontal"]');
    expect(separator).toHaveAttribute("data-orientation", "horizontal");
  });
});
