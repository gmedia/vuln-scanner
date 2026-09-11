import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppShell from "@/components/layout/AppShell";

function renderShell() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppShell", () => {
  it("renders sidebar without a sticky app banner", () => {
    renderShell();
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(document.querySelector("aside")).toBeInstanceOf(HTMLElement);
    const banners = screen.queryAllByRole("banner");
    banners.forEach((el) => {
      expect(el).not.toHaveClass("sticky");
      expect(el).not.toHaveClass("h-12");
    });
  });

  it("renders main content area", () => {
    renderShell();
    const main = screen.getByRole("main");
    expect(main).toBeInTheDocument();
    expect(main).toHaveClass("overflow-y-auto");
  });

  it("uses a wide content wrap for 2K layouts", () => {
    renderShell();
    const wrap = Array.from(document.querySelectorAll("div")).find((el) =>
      el.className.includes("2xl:max-w-[90rem]"),
    );
    expect(wrap).toBeInstanceOf(HTMLElement);
  });

  it("pads the main column for the home indicator", () => {
    renderShell();
    const wrap = Array.from(document.querySelectorAll("div")).find((el) =>
      el.className.includes("pb-[max(2.5rem,env(safe-area-inset-bottom))]"),
    );
    expect(wrap).toBeInstanceOf(HTMLElement);
  });

  it("renders sidebar toggle button with Menu icon", () => {
    renderShell();
    const toggles = screen.getAllByRole("button", {
      name: /toggle sidebar/i,
    });
    expect(toggles.length).toBeGreaterThanOrEqual(1);
    const trigger = toggles.find((el) => el.getAttribute("data-slot") === "sidebar-trigger");
    expect(trigger).toBeDefined();
    expect(trigger!.querySelector("svg")).toBeInTheDocument();
    expect(trigger!.className.split(/\s+/)).toContain("min-h-11");
  });

  it("keeps the mobile sidebar trigger in document flow so it does not overlay page titles", () => {
    renderShell();
    const trigger = screen
      .getAllByRole("button", { name: /toggle sidebar/i })
      .find((el) => el.getAttribute("data-slot") === "sidebar-trigger");
    expect(trigger).toBeDefined();
    expect(trigger!.className.split(/\s+/)).not.toContain("fixed");
    const wrap = trigger!.parentElement;
    expect(wrap).toBeInstanceOf(HTMLElement);
    expect(wrap!.className).toMatch(/md:hidden/);
  });

  it("does not open the mobile sheet overlay by default", () => {
    renderShell();
    expect(document.querySelector("[data-slot='sheet-overlay']")).toBeNull();
  });

  it("pads the sidebar brand for the notch and uses a wider mobile drawer", () => {
    renderShell();
    const header = document.querySelector("[data-slot='sidebar-header']");
    expect(header).toBeInstanceOf(HTMLElement);
    expect(header!.className).toMatch(/safe-area-inset-top/);
    const inner = document.querySelector("[data-sidebar='sidebar']");
    expect(inner).toBeInstanceOf(HTMLElement);
  });

  it("renders SINEXIS brand text in the sidebar", () => {
    renderShell();
    const sidebar = screen.getByRole("complementary");
    expect(sidebar).toHaveTextContent("SINE");
    expect(sidebar).toHaveTextContent("XIS");
  });
});
