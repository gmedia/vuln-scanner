import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Label } from "@/components/ui/Label";

describe("Label", () => {
  it("renders label text", () => {
    render(<Label htmlFor="field">Email</Label>);
    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it("associates with htmlFor", () => {
    render(<Label htmlFor="email-field">Email</Label>);
    const label = screen.getByText("Email");
    expect(label).toHaveAttribute("for", "email-field");
  });

  it("applies custom className", () => {
    render(
      <Label htmlFor="x" className="custom-label">
        Name
      </Label>,
    );
    expect(screen.getByText("Name")).toHaveClass("custom-label");
  });
});
