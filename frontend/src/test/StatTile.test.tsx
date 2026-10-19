import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Crosshair } from "lucide-react";
import {
  StatGrid,
  StatGridSkeleton,
  StatTile,
} from "@/components/patterns/StatTile";

const RAIL = "span.absolute.inset-y-2";

describe("StatTile", () => {
  it("renders the label, value, and testid", () => {
    render(<StatTile testid="tile" label="Agents" value="12" />);
    const tile = screen.getByTestId("tile");
    expect(tile).toHaveTextContent("Agents");
    expect(tile).toHaveTextContent("12");
  });

  it("paints the rail by default and omits it when railClass is null", () => {
    const { container, rerender } = render(
      <StatTile label="Agents" value="1" railClass="bg-primary" />,
    );
    expect(container.querySelector(RAIL)).toHaveClass("bg-primary");

    rerender(<StatTile label="Agents" value="1" railClass={null} />);
    expect(container.querySelector(RAIL)).toBeNull();
  });

  it("renders a pulse node and an icon", () => {
    render(
      <StatTile
        label="Status"
        value="on"
        icon={Crosshair}
        pulse={<span data-testid="pulse" />}
      />,
    );
    expect(screen.getByTestId("pulse")).toBeInTheDocument();
    expect(document.querySelector("svg")).toBeInTheDocument();
  });

  it("keeps extra content below the value by default and inline on request", () => {
    const { rerender } = render(
      <StatTile
        label="Sites"
        value="2 / 10"
        extra={<span data-testid="extra" />}
      />,
    );
    expect(screen.getByTestId("extra").parentElement).toHaveClass("mt-2");

    rerender(
      <StatTile
        label="Sites"
        value="2 / 10"
        extra={<span data-testid="extra" />}
        extraPlacement="inline"
      />,
    );
    expect(screen.getByTestId("extra").parentElement).not.toHaveClass("mt-2");
  });

  it("hides the value while loading and shows the skeleton", () => {
    render(
      <StatTile
        label="Agents"
        value="12"
        isLoading
        skeleton={<span data-testid="skeleton" />}
      />,
    );
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
    expect(screen.queryByText("12")).not.toBeInTheDocument();
  });

  it("prints the value above the label in valueFirst layout", () => {
    const { container } = render(
      <StatTile label="Open risk" value="3" valueFirst />,
    );
    const text = container.textContent ?? "";
    expect(text.indexOf("3")).toBeLessThan(text.indexOf("Open risk"));
  });
});

describe("StatGrid", () => {
  it("renders a responsive grid with an optional testid and label", () => {
    render(
      <StatGrid testid="grid" label="Overview" as="section">
        <span>child</span>
      </StatGrid>,
    );
    const grid = screen.getByTestId("grid");
    expect(grid.tagName).toBe("SECTION");
    expect(grid).toHaveAttribute("aria-label", "Overview");
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).toContain("lg:grid-cols-4");
  });

  it("renders one skeleton per tile", () => {
    const { container } = render(
      <StatGridSkeleton testid="skeleton-grid" count={3} />,
    );
    expect(screen.getByTestId("skeleton-grid")).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
  });
});
