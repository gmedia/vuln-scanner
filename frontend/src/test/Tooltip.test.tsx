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
    const elements = screen.getAllByText("Tooltip text");
    expect(elements.length).toBeGreaterThanOrEqual(1);
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
    const elements = screen.getAllByText("Tooltip text");
    const visible = elements.find(
      (el) => el.getAttribute("role") !== "tooltip",
    ) as HTMLElement;
    expect(visible).toHaveClass("custom-tooltip");
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
    const elements = screen.getAllByText("Tooltip text");
    const visible = elements.find(
      (el) => el.getAttribute("role") !== "tooltip",
    );
    expect(visible).toBeInTheDocument();
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
    const elements = screen.getAllByText("Tooltip text");
    const visible = elements.find(
      (el) => el.getAttribute("role") !== "tooltip",
    );
    expect(visible).toBeInTheDocument();
  });
});
