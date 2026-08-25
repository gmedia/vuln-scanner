import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Uptime, { mapUptimeError } from "@/pages/Uptime";

const mockList = vi.fn();

vi.mock("@/api/uptime", async () => {
  const actual = await vi.importActual<typeof import("@/api/uptime")>("@/api/uptime");
  return {
    ...actual,
    listMonitors: (...args: unknown[]) => mockList(...args),
    createMonitor: vi.fn(),
    deleteMonitor: vi.fn(),
    pauseMonitor: vi.fn(),
  };
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/uptime"]}>
        <Routes>
          <Route path="/uptime" element={<Uptime />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Uptime page", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockList.mockResolvedValue([]);
  });

  it("maps sku limit errors", () => {
    expect(mapUptimeError("Uptime seat limit for basic tier is 1")).toBe("limit");
  });

  it("shows empty state", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("uptime-empty")).toBeInTheDocument());
    expect(screen.getByTestId("uptime-add")).toBeInTheDocument();
    expect(screen.getByTestId("uptime-empty-cta")).toBeInTheDocument();
  });
});
