import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Progress } from "@/components/ui/Progress";
import { Input } from "@/components/ui/Input";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/Tooltip";

describe("Progress", () => {
  it("renders with default props", () => {
    render(<Progress />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders with a value and applies correct indicator transform", () => {
    render(<Progress value={50} />);
    const indicator = screen.getByRole("progressbar").firstChild as HTMLElement;
    expect(indicator).toHaveStyle({ transform: "translateX(-50%)" });
  });

  it("applies indicatorClassName to the indicator", () => {
    render(<Progress value={75} indicatorClassName="bg-red-500" />);
    const indicator = screen.getByRole("progressbar").firstChild as HTMLElement;
    expect(indicator).toHaveClass("bg-red-500");
  });

  it("renders at 0% value (fully empty)", () => {
    render(<Progress value={0} />);
    const indicator = screen.getByRole("progressbar").firstChild as HTMLElement;
    expect(indicator).toHaveStyle({ transform: "translateX(-100%)" });
  });

  it("renders at 100% value (fully filled)", () => {
    render(<Progress value={100} />);
    const indicator = screen.getByRole("progressbar").firstChild as HTMLElement;
    expect(indicator).toHaveStyle({ transform: "translateX(-0%)" });
  });
});

describe("Input", () => {
  it("renders with default type text", () => {
    render(<Input />);
    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
    expect(input).not.toBeDisabled();
  });

  it("renders with a placeholder", () => {
    render(<Input placeholder="Enter your name" />);
    expect(screen.getByPlaceholderText("Enter your name")).toBeInTheDocument();
  });

  it("can be disabled", () => {
    render(<Input disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("renders file type input", () => {
    render(<Input type="file" data-testid="file-input" />);
    const input = screen.getByTestId("file-input");
    expect(input).toHaveAttribute("type", "file");
  });

  it("applies custom className", () => {
    render(<Input className="custom-class" data-testid="input" />);
    expect(screen.getByTestId("input")).toHaveClass("custom-class");
  });

  it("accepts user input via fireEvent", () => {
    render(<Input data-testid="typed-input" />);
    const input = screen.getByTestId("typed-input");
    fireEvent.change(input, { target: { value: "hello world" } });
    expect(input).toHaveValue("hello world");
  });
});

describe("Tooltip", () => {
  it("renders trigger element", () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger>Hover</TooltipTrigger>
          <TooltipContent>Content</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByText("Hover")).toBeInTheDocument();
  });

  it("shows tooltip content on hover", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Tooltip content</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    const trigger = screen.getByText("Hover me");
    await user.hover(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Tooltip content");
  });
});
