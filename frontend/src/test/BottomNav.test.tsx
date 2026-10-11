import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BottomNav from "@/components/layout/BottomNav";
import { useFeatureStatus } from "@/hooks/use-feature-status";

vi.mock("@/hooks/use-feature-status", () => ({
  useFeatureStatus: vi.fn(),
}));

function renderNav(path = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe("BottomNav", () => {
  beforeEach(() => {
    vi.mocked(useFeatureStatus).mockReturnValue({
      guard: false,
      uptime: false,
      isGuardAdmin: false,
    });
  });

  it("shows only Dashboard, Scan, and Assets when flags are off", () => {
    renderNav();
    expect(screen.getByTestId("bottom-nav-dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("bottom-nav-scan")).toBeInTheDocument();
    expect(screen.getByTestId("bottom-nav-assets")).toBeInTheDocument();
    expect(screen.queryByTestId("bottom-nav-guard")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bottom-nav-uptime")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("shows Guard and Uptime when both flags are on", () => {
    vi.mocked(useFeatureStatus).mockReturnValue({
      guard: true,
      uptime: true,
      isGuardAdmin: true,
    });
    renderNav();
    expect(screen.getByTestId("bottom-nav-dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("bottom-nav-scan")).toBeInTheDocument();
    expect(screen.getByTestId("bottom-nav-assets")).toBeInTheDocument();
    expect(screen.getByTestId("bottom-nav-guard")).toBeInTheDocument();
    expect(screen.getByTestId("bottom-nav-uptime")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("marks Scan current on scan routes", () => {
    renderNav("/scan/domain");
    expect(screen.getByTestId("bottom-nav-scan")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByTestId("bottom-nav-dashboard")).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("labels the landmark from the nav namespace", () => {
    renderNav();
    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeInTheDocument();
  });
});
