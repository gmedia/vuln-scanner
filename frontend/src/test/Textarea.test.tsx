import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Textarea } from "@/components/ui/Textarea";

describe("Textarea", () => {
  it("renders a textarea", () => {
    render(<Textarea placeholder="Notes" />);
    expect(screen.getByPlaceholderText("Notes").tagName).toBe("TEXTAREA");
  });

  it("can be disabled", () => {
    render(<Textarea disabled placeholder="Disabled" />);
    expect(screen.getByPlaceholderText("Disabled")).toBeDisabled();
  });

  it("applies custom className", () => {
    render(<Textarea className="extra" placeholder="X" />);
    expect(screen.getByPlaceholderText("X")).toHaveClass("extra");
  });
});
