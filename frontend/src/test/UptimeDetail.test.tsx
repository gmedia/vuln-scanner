import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  within,
  act,
  fireEvent,
} from "@testing-library/react";
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

vi.mock("@/components/ui/DatePicker", () => ({
  DatePicker: ({
    id,
    value,
    onChange,
    placeholder,
    "aria-label": ariaLabel,
  }: {
    id?: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    "aria-label"?: string;
  }) => (
    <input
      id={id}
      data-testid={id}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

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

const mobileListeners = new Set<() => void>();

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: width,
  });
  window.matchMedia = ((query: string) => ({
    matches:
      query.includes("max-width") && width < 768
        ? true
        : query.includes("min-width: 1280px") && width >= 1280,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (...args: unknown[]) => {
      const listener = args[1];
      if (typeof listener === "function") mobileListeners.add(listener as () => void);
    },
    removeEventListener: (...args: unknown[]) => {
      mobileListeners.delete(args[1] as () => void);
    },
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

function fireViewportChange() {
  act(() => {
    mobileListeners.forEach((listener) => listener());
    window.dispatchEvent(new Event("resize"));
  });
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
  const originalMatchMedia = window.matchMedia;
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
    mobileListeners.clear();
  });

  beforeEach(() => {
    setViewport(1024);
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
    expect(
      screen.getAllByTestId("uptime-history-row").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId("uptime-sample-pagination")).not.toBeInTheDocument();
  });

  it("resets sample page when the range chip changes", async () => {
    const user = userEvent.setup();
    mockSamples.mockResolvedValue({
      items: Array.from({ length: 20 }, (_, i) => ({
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
      expect(last?.[1]).toMatchObject({ limit: 20, offset: 0 });
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
    expect(screen.getAllByTestId("uptime-outage-row")).toHaveLength(5);
    expect(screen.getByTestId("uptime-outage-pagination")).toHaveTextContent(
      "1/3",
    );
    await user.click(
      screen
        .getByTestId("uptime-outage-pagination")
        .querySelector('button[aria-label="Next page"]') as HTMLElement,
    );
    await waitFor(() =>
      expect(screen.getByTestId("uptime-outage-pagination")).toHaveTextContent(
        "2/3",
      ),
    );
    expect(screen.getAllByTestId("uptime-outage-row")).toHaveLength(5);
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
        "2/3",
      ),
    );
    expect(screen.getAllByTestId("uptime-outage-row")).toHaveLength(5);
    await user.click(screen.getByTestId("uptime-range-6h"));
    await waitFor(() =>
      expect(screen.getByTestId("uptime-outage-pagination")).toHaveTextContent(
        "1/3",
      ),
    );
    expect(screen.getAllByTestId("uptime-outage-row")).toHaveLength(5);
  });

  it("shows the sample pager under the same value condition on mobile and desktop", async () => {
    setViewport(1024);
    mockSamples.mockResolvedValue({
      items: Array.from({ length: 20 }, (_, i) => ({
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
    expect(screen.getByTestId("uptime-sample-pagination")).toHaveTextContent(
      "1/4",
    );
    unmount();
    setViewport(375);
    fireViewportChange();
    renderDetail();
    await waitFor(() =>
      expect(
        screen.getByTestId("uptime-sample-pagination"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("uptime-sample-pagination")).toHaveTextContent(
      "1/8",
    );
    expect(
      screen.getAllByTestId("uptime-history-row").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("caps mobile outage pages at 5 rows with a 1/3 pager for 12 outages", async () => {
    const user = userEvent.setup();
    setViewport(375);
    mockEvents.mockResolvedValue(makeOutageEvents(12));
    renderDetail();
    await waitFor(() =>
      expect(
        screen.getByTestId("uptime-outage-pagination"),
      ).toBeInTheDocument(),
    );
    expect(screen.getAllByTestId("uptime-outage-row")).toHaveLength(5);
    expect(screen.getByTestId("uptime-outage-pagination")).toHaveTextContent(
      "1/3",
    );
    await user.click(
      screen
        .getByTestId("uptime-outage-pagination")
        .querySelector('button[aria-label="Next page"]') as HTMLElement,
    );
    await waitFor(() =>
      expect(screen.getByTestId("uptime-outage-pagination")).toHaveTextContent(
        "2/3",
      ),
    );
    expect(screen.getAllByTestId("uptime-outage-row")).toHaveLength(5);
  });

  it("requests mobile check pages with limit 10 and shows the pager", async () => {
    setViewport(375);
    mockSamples.mockResolvedValue({
      items: Array.from({ length: 10 }, (_, i) => ({
        id: `s${i}`,
        checked_at: `2026-09-17T11:${String(i).padStart(2, "0")}:00Z`,
        ok: true,
        latency_ms: 10,
        status_code: 200,
        error: null,
      })),
      total: 25,
    });
    renderDetail();
    await waitFor(() =>
      expect(
        screen.getByTestId("uptime-sample-pagination"),
      ).toBeInTheDocument(),
    );
    await waitFor(() => {
      const calls = mockSamples.mock.calls;
      const last = calls[calls.length - 1];
      expect(last?.[1]).toMatchObject({ limit: 10, offset: 0 });
    });
    expect(screen.getByTestId("uptime-sample-pagination")).toHaveTextContent(
      "1/3",
    );
    expect(screen.getAllByTestId("uptime-history-row")).toHaveLength(20);
  });

  it("resets both pages when the viewport crosses the mobile breakpoint", async () => {
    const user = userEvent.setup();
    mockEvents.mockResolvedValue(makeOutageEvents(12));
    mockSamples.mockResolvedValue({
      items: Array.from({ length: 20 }, (_, i) => ({
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
      expect(
        screen.getByTestId("uptime-outage-pagination"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("uptime-outage-pagination")).toHaveTextContent(
      "1/3",
    );
    expect(screen.getAllByTestId("uptime-outage-row")).toHaveLength(5);
    await user.click(
      screen
        .getByTestId("uptime-outage-pagination")
        .querySelector('button[aria-label="Next page"]') as HTMLElement,
    );
    await waitFor(() =>
      expect(screen.getByTestId("uptime-outage-pagination")).toHaveTextContent(
        "2/3",
      ),
    );
    setViewport(375);
    fireViewportChange();
    await waitFor(() =>
      expect(screen.getByTestId("uptime-outage-pagination")).toHaveTextContent(
        "1/3",
      ),
    );
    expect(screen.getAllByTestId("uptime-outage-row")).toHaveLength(5);
    await waitFor(() => {
      const calls = mockSamples.mock.calls;
      const last = calls[calls.length - 1];
      expect(last?.[1]).toMatchObject({ limit: 10, offset: 0 });
    });
  });

  it("renders probe log as mobile cards and desktop table with the same rows", async () => {
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
        {
          id: "s2",
          checked_at: "2026-09-17T11:59:00Z",
          ok: false,
          latency_ms: 10,
          status_code: null,
          error: "connection refused",
        },
      ],
      total: 2,
    });
    renderDetail();
    await waitFor(() =>
      expect(screen.getByTestId("uptime-history-panel")).toBeInTheDocument(),
    );
    const mobile = await screen.findByTestId("uptime-history-mobile");
    expect(mobile).toHaveClass("md:hidden");
    const desktop = screen.getByTestId("uptime-history-desktop");
    expect(desktop).toHaveClass("hidden", "md:block");
    const mobileRows = within(mobile).getAllByTestId("uptime-history-row");
    const desktopRows = within(desktop).getAllByTestId("uptime-history-row");
    expect(mobileRows).toHaveLength(2);
    expect(desktopRows).toHaveLength(2);
    expect(mobileRows[1]?.textContent).toMatch(/connection refused/);
    expect(mobileRows[1]?.textContent).toMatch(/TCP refused/);
    expect(mobileRows[1]?.textContent).toMatch(/10ms/);
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

  it("drives events fetch with custom outage window", async () => {
    renderDetail();
    await waitFor(() =>
      expect(screen.getByTestId("uptime-outage-filters")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("uptime-outage-from")).toBeInTheDocument();
    expect(screen.getByTestId("uptime-outage-to")).toBeInTheDocument();
    const before = mockEvents.mock.calls.length;
    const fromDay = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    const toDay = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const day = (d: Date) =>
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    fireEvent.change(screen.getByTestId("uptime-outage-from-input"), {
      target: { value: day(fromDay) },
    });
    fireEvent.change(screen.getByTestId("uptime-outage-to-input"), {
      target: { value: day(toDay) },
    });
    await waitFor(() =>
      expect(mockEvents.mock.calls.length).toBeGreaterThan(before),
    );
    const last = mockEvents.mock.calls[mockEvents.mock.calls.length - 1]?.[1] as {
      from: string;
      until: string;
      limit: number;
    };
    expect(last.limit).toBe(200);
    const wantFrom = new Date(
      fromDay.getFullYear(),
      fromDay.getMonth(),
      fromDay.getDate(),
    );
    const wantUntil = new Date(
      toDay.getFullYear(),
      toDay.getMonth(),
      toDay.getDate(),
      23,
      59,
      59,
      999,
    );
    expect(new Date(last.from).getTime()).toBe(wantFrom.getTime());
    expect(new Date(last.until).getTime()).toBe(wantUntil.getTime());
    expect(
      screen.queryByTestId("uptime-outage-range-error"),
    ).not.toBeInTheDocument();
  });

  it("shows error and falls back for reversed custom range", async () => {
    renderDetail();
    await waitFor(() =>
      expect(screen.getByTestId("uptime-outage-filters")).toBeInTheDocument(),
    );
    const before = mockEvents.mock.calls.length;
    const fromDay = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const toDay = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const day = (d: Date) =>
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    fireEvent.change(screen.getByTestId("uptime-outage-from-input"), {
      target: { value: day(fromDay) },
    });
    fireEvent.change(screen.getByTestId("uptime-outage-to-input"), {
      target: { value: day(toDay) },
    });
    await waitFor(() =>
      expect(
        screen.getByTestId("uptime-outage-range-error"),
      ).toBeInTheDocument(),
    );
    expect(mockEvents.mock.calls.slice(before)).toHaveLength(0);
  });

  it("keeps tab window for partial custom range", async () => {
    renderDetail();
    await waitFor(() =>
      expect(screen.getByTestId("uptime-outage-filters")).toBeInTheDocument(),
    );
    const before = mockEvents.mock.calls.length;
    const fromDay = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const day =
      fromDay.getFullYear() +
      "-" +
      pad(fromDay.getMonth() + 1) +
      "-" +
      pad(fromDay.getDate());
    fireEvent.change(screen.getByTestId("uptime-outage-from-input"), {
      target: { value: day },
    });
    await waitFor(() =>
      expect(screen.getByTestId("uptime-outage-from-input")).toHaveValue(day),
    );
    expect(
      screen.queryByTestId("uptime-outage-range-error"),
    ).not.toBeInTheDocument();
    expect(mockEvents.mock.calls.slice(before)).toHaveLength(0);
  });

  it("rejects custom from older than 90 days", async () => {
    renderDetail();
    await waitFor(() =>
      expect(screen.getByTestId("uptime-outage-filters")).toBeInTheDocument(),
    );
    const before = mockEvents.mock.calls.length;
    const fromDay = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    const toDay = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const day = (d: Date) =>
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    fireEvent.change(screen.getByTestId("uptime-outage-from-input"), {
      target: { value: day(fromDay) },
    });
    fireEvent.change(screen.getByTestId("uptime-outage-to-input"), {
      target: { value: day(toDay) },
    });
    await waitFor(() =>
      expect(
        screen.getByTestId("uptime-outage-range-error"),
      ).toBeInTheDocument(),
    );
    expect(mockEvents.mock.calls.slice(before)).toHaveLength(0);
  });

  it("clears custom window back to tab window", async () => {
    renderDetail();
    await waitFor(() =>
      expect(screen.getByTestId("uptime-outage-filters")).toBeInTheDocument(),
    );
    const fromDay = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    const toDay = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const day = (d: Date) =>
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    fireEvent.change(screen.getByTestId("uptime-outage-from-input"), {
      target: { value: day(fromDay) },
    });
    fireEvent.change(screen.getByTestId("uptime-outage-to-input"), {
      target: { value: day(toDay) },
    });
    await waitFor(() =>
      expect(mockEvents.mock.calls.length).toBeGreaterThan(1),
    );
    fireEvent.click(screen.getByTestId("uptime-outage-clear"));
    await waitFor(() =>
      expect(screen.getByTestId("uptime-outage-from-input")).toHaveValue(""),
    );
    expect(screen.getByTestId("uptime-outage-to-input")).toHaveValue("");
    await waitFor(() => {
      const calls = mockEvents.mock.calls;
      const last = calls[calls.length - 1]?.[1] as {
        from: string;
        until: string;
      };
      const span =
        new Date(last.until).getTime() - new Date(last.from).getTime();
      expect(span).toBeLessThan(2 * 24 * 60 * 60 * 1000);
    });
    expect(
      screen.queryByTestId("uptime-outage-range-error"),
    ).not.toBeInTheDocument();
  });

  it("resets outage pager on custom window change", async () => {
    mockEvents.mockResolvedValue(makeOutageEvents(12));
    renderDetail();
    await waitFor(() =>
      expect(
        screen.getByTestId("uptime-outage-pagination"),
      ).toBeInTheDocument(),
    );
    fireEvent.click(
      screen
        .getByTestId("uptime-outage-pagination")
        .querySelector('[aria-label="Next page"]') as HTMLElement,
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("uptime-outage-pagination"),
      ).toHaveTextContent("2/3"),
    );
    const pairAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const today =
      pairAt.getFullYear() +
      "-" +
      pad(pairAt.getMonth() + 1) +
      "-" +
      pad(pairAt.getDate());
    mockEvents.mockResolvedValue([
      {
        id: "e-down-x",
        from_state: "up",
        to_state: "down",
        at: new Date(pairAt.getTime() - 30 * 60 * 1000).toISOString(),
        notified: true,
        detail: "down x",
      },
      {
        id: "e-up-x",
        from_state: "down",
        to_state: "up",
        at: pairAt.toISOString(),
        notified: true,
        detail: "up x",
      },
    ]);
    fireEvent.change(screen.getByTestId("uptime-outage-from-input"), {
      target: { value: today },
    });
    fireEvent.change(screen.getByTestId("uptime-outage-to-input"), {
      target: { value: today },
    });
    await waitFor(() => {
      const calls = mockEvents.mock.calls;
      const last = calls[calls.length - 1]?.[1] as {
        from: string;
        until: string;
      };
      expect(new Date(last.from).toISOString().slice(0, 10)).toBe(today);
    });
    await waitFor(() =>
      expect(screen.getAllByTestId("uptime-outage-row")).toHaveLength(1),
    );
    expect(
      screen.queryByTestId("uptime-outage-pagination"),
    ).not.toBeInTheDocument();
  });
});
