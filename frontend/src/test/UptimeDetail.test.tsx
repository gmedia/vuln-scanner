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
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/uptime/${id}`]}>
        <Routes>
          <Route path="/uptime/:id" element={<UptimeDetail />} />
          <Route path="/uptime" element={<div data-testid="uptime-list">list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { qc, ...view };
}

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
    const nowMs = Date.now();
    mockEvents.mockResolvedValue([
      {
        id: "e-prior",
        from_state: "up",
        to_state: "down",
        at: new Date(nowMs - 30 * 60 * 60 * 1000).toISOString(),
        notified: true,
        detail: "prior",
      },
      {
        id: "e-down",
        from_state: "up",
        to_state: "down",
        at: new Date(nowMs - 4 * 60 * 60 * 1000).toISOString(),
        notified: true,
        detail: "timeout",
      },
      {
        id: "e-up",
        from_state: "down",
        to_state: "up",
        at: new Date(nowMs - 3 * 60 * 60 * 1000).toISOString(),
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

  it("does not treat a 400 as not-found", async () => {
    mockGet.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400 },
      message: "Bad Request",
    });
    const { qc } = renderDetail();
    await waitFor(() =>
      expect(qc.getQueryState(["uptime-monitor", "m1"])?.status).toBe("error"),
    );
    expect(screen.queryByTestId("uptime-detail-not-found")).not.toBeInTheDocument();
    expect(screen.getByTestId("uptime-detail")).toBeInTheDocument();
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
    const bar = screen.getByTestId("uptime-availability-bar");
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute("aria-hidden");
    expect(bar).not.toHaveAttribute("role");
    expect(bar.querySelector('[data-state="down"]')).toBeTruthy();
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
      const calls = mockSamples.mock.calls;
      const last = calls[calls.length - 1];
      expect(last?.[1]).toMatchObject({ limit: 50, offset: 0 });
    });
    expect(mockStats.mock.calls.length).toBeGreaterThan(1);
  });

  function makeOutageEvents(count: number) {
    const nowMs = Date.now();
    const baseMs = nowMs - count * 20 * 60 * 1000;
    const events: Array<{
      id: string;
      from_state: string;
      to_state: string;
      at: string;
      notified: boolean;
      detail: string;
    }> = [];
    for (let k = 0; k < count; k += 1) {
      const downMs = baseMs + k * 20 * 60 * 1000;
      const upMs = downMs + 10 * 60 * 1000;
      events.push({
        id: `e-down-${k}`,
        from_state: "up",
        to_state: "down",
        at: new Date(downMs).toISOString(),
        notified: true,
        detail: `down ${k}`,
      });
      events.push({
        id: `e-up-${k}`,
        from_state: "down",
        to_state: "up",
        at: new Date(upMs).toISOString(),
        notified: true,
        detail: `up ${k}`,
      });
    }
    return events;
  }

  it("hides the outage pager when outages fit on one page", async () => {
    renderDetail();
    await waitFor(() =>
      expect(screen.getAllByTestId("uptime-outage-row").length).toBeGreaterThanOrEqual(
        1,
      ),
    );
    expect(
      screen.queryByTestId("uptime-outage-pagination"),
    ).not.toBeInTheDocument();
  });

  it("pages outages client-side with a value-based pager", async () => {
    const user = userEvent.setup();
    mockEvents.mockResolvedValue(makeOutageEvents(12));
    renderDetail();
    await waitFor(() =>
      expect(
        screen.getByTestId("uptime-outage-pagination"),
      ).toBeInTheDocument(),
    );
    expect(screen.getAllByTestId("uptime-outage-row")).toHaveLength(10);
    expect(screen.getByTestId("uptime-outage-pagination")).toHaveTextContent(
      "1/2",
    );
    await user.click(
      screen
        .getByTestId("uptime-outage-pagination")
        .querySelector('button[aria-label="Next page"]') as HTMLElement,
    );
    await waitFor(() =>
      expect(screen.getByTestId("uptime-outage-pagination")).toHaveTextContent(
        "2/2",
      ),
    );
    expect(screen.getAllByTestId("uptime-outage-row")).toHaveLength(2);
  });

  it("resets the outage page when the range chip changes", async () => {
    const user = userEvent.setup();
    mockEvents.mockResolvedValue(makeOutageEvents(12));
    renderDetail();
    await waitFor(() =>
      expect(
        screen.getByTestId("uptime-outage-pagination"),
      ).toBeInTheDocument(),
    );
    await user.click(
      screen
        .getByTestId("uptime-outage-pagination")
        .querySelector('button[aria-label="Next page"]') as HTMLElement,
    );
    await waitFor(() =>
      expect(screen.getByTestId("uptime-outage-pagination")).toHaveTextContent(
        "2/2",
      ),
    );
    expect(screen.getAllByTestId("uptime-outage-row")).toHaveLength(2);
    await user.click(screen.getByTestId("uptime-range-6h"));
    await waitFor(() =>
      expect(screen.getByTestId("uptime-outage-pagination")).toHaveTextContent(
        "1/2",
      ),
    );
    expect(screen.getAllByTestId("uptime-outage-row")).toHaveLength(10);
  });

  it("shows the sample pager under the same value condition on mobile and desktop", async () => {
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
    const { unmount } = renderDetail();
    await waitFor(() =>
      expect(
        screen.getByTestId("uptime-sample-pagination"),
      ).toBeInTheDocument(),
    );
    unmount();
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 375,
    });
    window.dispatchEvent(new Event("resize"));
    renderDetail();
    await waitFor(() =>
      expect(
        screen.getByTestId("uptime-sample-pagination"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("uptime-sample-pagination")).toHaveTextContent(
      "1/2",
    );
  });

  it("clips a prior-down outage start to the selected range", async () => {
    const priorAt = "2020-01-01T00:00:00.000Z";
    const recoverAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mockEvents.mockResolvedValue([
      {
        id: "e-prior",
        from_state: "up",
        to_state: "down",
        at: priorAt,
        notified: true,
        detail: "prior",
      },
      {
        id: "e-up",
        from_state: "down",
        to_state: "up",
        at: recoverAt,
        notified: true,
        detail: "recovered",
      },
    ]);
    renderDetail();
    await waitFor(() =>
      expect(screen.getAllByTestId("uptime-outage-row")).toHaveLength(1),
    );
    const row = screen.getByTestId("uptime-outage-row");
    expect(row.textContent).not.toContain(formatStamp(priorAt));
    expect(row.textContent).toContain(formatStamp(recoverAt));
  });
});
