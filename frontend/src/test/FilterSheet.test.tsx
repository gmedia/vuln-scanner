import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterSheet } from "@/components/ops/FilterSheet";

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

function renderSheet() {
  return render(
    <FilterSheet
      activeCount={2}
      triggerTestId="filters-toggle"
      sheetTestId="filters-sheet"
    >
      {() => <div data-testid="filter-fields">Fields</div>}
    </FilterSheet>,
  );
}

describe("FilterSheet", () => {
  const originalWidth = window.innerWidth;

  beforeEach(() => {
    setViewport(1024);
  });

  afterEach(() => {
    setViewport(originalWidth);
  });

  it("renders the fields inline on desktop without a trigger", () => {
    renderSheet();
    expect(screen.getByTestId("filter-fields")).toBeInTheDocument();
    expect(screen.queryByTestId("filters-toggle")).not.toBeInTheDocument();
    expect(screen.queryByTestId("filters-sheet")).not.toBeInTheDocument();
  });

  it("hides the fields behind a trigger on mobile", () => {
    setViewport(390);
    renderSheet();
    expect(screen.getByTestId("filters-toggle")).toBeInTheDocument();
    expect(screen.queryByTestId("filter-fields")).not.toBeInTheDocument();
  });

  it("opens the sheet with the fields and shows the active count", async () => {
    setViewport(390);
    const user = userEvent.setup();
    renderSheet();
    expect(screen.getByTestId("filters-toggle")).toHaveTextContent("Filters");
    expect(screen.getByTestId("filters-toggle")).toHaveTextContent("2");

    await user.click(screen.getByTestId("filters-toggle"));
    expect(await screen.findByTestId("filters-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("filter-fields")).toBeInTheDocument();
  });

  it("closes the sheet from the Done button", async () => {
    setViewport(390);
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByTestId("filters-toggle"));
    await user.click(await screen.findByTestId("filters-sheet-done"));
    expect(screen.queryByTestId("filter-fields")).not.toBeInTheDocument();
  });
});
