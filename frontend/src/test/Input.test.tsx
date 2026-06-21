import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "@/components/ui/Input";

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input placeholder="Type here" />);
    const input = screen.getByPlaceholderText("Type here");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  it("applies custom className", () => {
    render(<Input className="custom-input" placeholder="Custom" />);
    const input = screen.getByPlaceholderText("Custom");
    expect(input).toHaveClass("custom-input");
  });

  it("passes additional HTML attributes", () => {
    render(<Input data-testid="test-input" placeholder="Attr" />);
    const input = screen.getByTestId("test-input");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("placeholder", "Attr");
  });

  it("forwards ref to the input element", () => {
    let refValue: HTMLInputElement | null = null;
    render(
      <Input
        ref={(el) => {
          refValue = el;
        }}
        placeholder="Ref test"
      />,
    );
    expect(refValue).toBeInstanceOf(HTMLInputElement);
    const el = refValue as unknown as HTMLInputElement | null;
    expect(el?.tagName).toBe("INPUT");
  });

  it("can be disabled", () => {
    render(<Input disabled placeholder="Disabled input" />);
    const input = screen.getByPlaceholderText("Disabled input");
    expect(input).toBeDisabled();
  });

  it("renders with a type attribute", () => {
    render(<Input type="email" placeholder="Email" />);
    const input = screen.getByPlaceholderText("Email");
    expect(input).toHaveAttribute("type", "email");
  });
});
