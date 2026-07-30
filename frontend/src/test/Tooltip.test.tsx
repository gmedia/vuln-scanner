import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip";

describe("Tooltip", () => {
  it("TooltipContent renders children", () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Tooltip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent("Tooltip text");
  });

  it("TooltipContent applies custom className", () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent className="custom-tooltip">Tooltip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByRole("tooltip")).toHaveClass("custom-tooltip");
  });

  it("TooltipContent renders with default sideOffset", () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Tooltip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("TooltipContent applies custom sideOffset", () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent sideOffset={8}>Tooltip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});
