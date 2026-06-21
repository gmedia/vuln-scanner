import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";

describe("AppShell", () => {
  it("renders sidebar and header", () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });

  it("renders main content area", () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("renders sidebar toggle button with Menu icon", () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );
    const toggleButton = screen.getByRole("button", { name: /toggle sidebar/i });
    expect(toggleButton).toBeInTheDocument();
    // Menu icon is rendered inside the button
    expect(toggleButton.querySelector("svg")).toBeInTheDocument();
  });

  it("sidebar overlay hidden by default when sidebarOpen is false", () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );
    // The backdrop overlay (bg-black/60) should not be in the document
    // since sidebarOpen starts as false
    const overlays = document.querySelectorAll(".bg-black\\/60");
    expect(overlays.length).toBe(0);
  });

  it("renders VULNSCAN brand text in header", () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );
    const header = screen.getByRole("banner");
    expect(header).toHaveTextContent("VULN");
    expect(header).toHaveTextContent("SCAN");
  });
});
