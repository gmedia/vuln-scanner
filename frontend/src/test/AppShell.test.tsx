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
  });

  it("renders main content area", () => {
    renderShell();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("renders sidebar toggle button with Menu icon", () => {
    renderShell();
    const toggleButton = screen.getByRole("button", {
      name: /toggle sidebar/i,
    });
    expect(toggleButton).toBeInTheDocument();
    // Menu icon is rendered inside the button
    expect(toggleButton.querySelector("svg")).toBeInTheDocument();
  });

  it("sidebar overlay hidden by default when sidebarOpen is false", () => {
    renderShell();
    const overlays = document.querySelectorAll(".bg-black\\/60");
    expect(overlays.length).toBe(0);
  });

  it("renders SINEXIS brand text in header", () => {
    renderShell();
    const header = screen.getByRole("banner");
    expect(header).toHaveTextContent("SINE");
    expect(header).toHaveTextContent("XIS");
  });
});
