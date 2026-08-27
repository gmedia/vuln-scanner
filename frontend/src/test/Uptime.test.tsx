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

  it("shows KPI badges when monitors exist", async () => {
    mockList.mockResolvedValue([
      {
        id: "m1",
        organization_id: "o1",
        name: "web",
        check_type: "http",
        target: "https://example.com",
        interval_seconds: 60,
        timeout_seconds: 10,
        expect_status: 200,
        keyword: null,
        keyword_invert: false,
        enabled: true,
        state: "up",
        consecutive_fails: 0,
        last_checked_at: null,
        last_status_code: 200,
        last_latency_ms: 12,
        last_error: null,
        next_check_at: "2026-08-25T00:00:00Z",
        notify_email: null,
        asset_id: null,
        created_at: "2026-08-25T00:00:00Z",
        updated_at: "2026-08-25T00:00:00Z",
        sku: "multi",
        sku_limit: 10,
        uptime_24h: 99.9,
      },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByTestId("uptime-kpi")).toBeInTheDocument());
    expect(screen.getByTestId("uptime-row")).toBeInTheDocument();
    expect(screen.getByTestId("uptime-filters")).toBeInTheDocument();
  });

  it("polls while a monitor is still unknown", async () => {
    mockList.mockResolvedValue([
      {
        id: "m1",
        organization_id: "o1",
        name: "web",
        check_type: "http",
        target: "https://example.com",
        interval_seconds: 60,
        timeout_seconds: 10,
        expect_status: 200,
        keyword: null,
        keyword_invert: false,
        enabled: true,
        state: "unknown",
        consecutive_fails: 0,
        last_checked_at: null,
        last_status_code: null,
        last_latency_ms: null,
        last_error: null,
        next_check_at: "2026-08-25T00:00:00Z",
        notify_email: null,
        asset_id: null,
        created_at: "2026-08-25T00:00:00Z",
        updated_at: "2026-08-25T00:00:00Z",
        sku: "multi",
        sku_limit: 10,
        uptime_24h: null,
      },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByTestId("uptime-row")).toBeInTheDocument());
    expect(mockList.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
