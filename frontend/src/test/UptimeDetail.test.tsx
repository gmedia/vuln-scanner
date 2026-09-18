import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import UptimeDetail from "@/pages/UptimeDetail";
import type { UptimeMonitor } from "@/api/uptime";

const mockGet = vi.fn();
const mockSamples = vi.fn();
const mockEvents = vi.fn();
const mockStats = vi.fn();
const mockPause = vi.fn();

vi.mock("@/api/uptime", async () => {
  const actual = await vi.importActual<typeof import("@/api/uptime")>(
    "@/api/uptime",
  );
  return {
    ...actual,
    getMonitor: (...args: unknown[]) => mockGet(...args),
    listSamples: (...args: unknown[]) => mockSamples(...args),
    listEvents: (...args: unknown[]) => mockEvents(...args),
    getMonitorStats: (...args: unknown[]) => mockStats(...args),
    pauseMonitor: (...args: unknown[]) => mockPause(...args),
  };
});

const MONITOR: UptimeMonitor = {
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
  last_checked_at: "2026-09-17T12:00:00Z",
  last_status_code: 200,
  last_latency_ms: 42,
  last_error: null,
  next_check_at: "2026-09-17T12:01:00Z",
  notify_email: null,
  asset_id: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-17T12:00:00Z",
  sku: "multi",
  sku_limit: 10,
  uptime_24h: 99.5,
};

function renderDetail(id = "m1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/uptime/${id}`]}>
        <Routes>
          <Route path="/uptime/:id" element={<UptimeDetail />} />
          <Route path="/uptime" element={<div data-testid="uptime-list">list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("UptimeDetail", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSamples.mockReset();
    mockEvents.mockReset();
    mockStats.mockReset();
    mockPause.mockReset();
    mockGet.mockResolvedValue(MONITOR);
    mockSamples.mockResolvedValue({
      items: [
        {
          id: "s1",
          checked_at: "2026-09-17T12:00:00Z",
          ok: true,
          latency_ms: 42,
          status_code: 200,
          error: null,
        },
      ],
      total: 1,
    });
    mockEvents.mockResolvedValue([
      {
        id: "e-prior",
        from_state: "up",
        to_state: "down",
        at: "2026-09-16T20:00:00Z",
        notified: true,
        detail: "prior",
      },
      {
        id: "e-down",
        from_state: "up",
        to_state: "down",
        at: "2026-09-17T08:00:00Z",
        notified: true,
        detail: "timeout",
      },
      {
        id: "e-up",
        from_state: "down",
        to_state: "up",
        at: "2026-09-17T09:00:00Z",
        notified: true,
        detail: "recovered",
      },
    ]);
    mockStats.mockResolvedValue({
      uptime_pct: 99.12,
      ok_count: 1400,
      total_count: 1412,
      from_at: "2026-09-16T12:00:00Z",
      until_at: "2026-09-17T12:00:00Z",
    });
  });

  it("shows not-found when the monitor is missing", async () => {
    mockGet.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404 },
      message: "Not Found",
    });
    renderDetail("missing");
    await waitFor(() =>
      expect(screen.getByTestId("uptime-detail-not-found")).toBeInTheDocument(),
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "/uptime");
  });

  it("renders range chips, availability bar, outages, and probe log", async () => {
    renderDetail();
    await waitFor(() =>
      expect(screen.getByTestId("uptime-range-tabs")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("uptime-range-6h")).toBeInTheDocument();
    expect(screen.getByTestId("uptime-range-24h")).toBeInTheDocument();
    expect(screen.getByTestId("uptime-range-7d")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("uptime-detail-kpi")).toHaveTextContent("99.12%"),
    );
    expect(screen.getByTestId("uptime-availability-bar")).toBeInTheDocument();
    expect(
      screen.getByTestId("uptime-availability-bar").querySelector('[data-state="down"]'),
    ).toBeTruthy();
    expect(screen.getAllByTestId("uptime-outage-row").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("uptime-history-panel")).toBeInTheDocument();
    expect(screen.getByTestId("uptime-history-row")).toBeInTheDocument();
    expect(screen.queryByTestId("uptime-sample-pagination")).not.toBeInTheDocument();
  });

  it("resets sample page when the range chip changes", async () => {
    const user = userEvent.setup();
    mockSamples.mockResolvedValue({
      items: Array.from({ length: 50 }, (_, i) => ({
        id: `s${i}`,
        checked_at: `2026-09-17T11:${String(i).padStart(2, "0")}:00Z`,
        ok: true,
        latency_ms: 10,
        status_code: 200,
        error: null,
      })),
      total: 80,
    });
    renderDetail();
    await waitFor(() =>
      expect(screen.getByTestId("uptime-sample-pagination")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("uptime-range-6h"));
    await waitFor(() => {
      const last = mockSamples.mock.calls.at(-1);
      expect(last?.[1]).toMatchObject({ limit: 50, offset: 0 });
    });
    expect(mockStats.mock.calls.length).toBeGreaterThan(1);
  });
});
