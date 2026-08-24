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
  it("renders sidebar and header", () => {
    renderShell();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(document.querySelector("aside")).toBeInstanceOf(HTMLElement);
  });

  it("renders main content area", () => {
    renderShell();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("uses a wide content wrap for 2K layouts", () => {
    renderShell();
    const wrap = Array.from(document.querySelectorAll("div")).find((el) =>
      el.className.includes("2xl:max-w-[140rem]"),
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
  });

  it("does not open the mobile sheet overlay by default", () => {
    renderShell();
    expect(document.querySelector("[data-slot='sheet-overlay']")).toBeNull();
  });

  it("renders SINEXIS brand text in header", () => {
    renderShell();
    const header = screen.getByRole("banner");
    expect(header).toHaveTextContent("SINE");
    expect(header).toHaveTextContent("XIS");
  });
});
