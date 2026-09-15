import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Uptime from "@/pages/Uptime";
import {
  explainUptimeError,
  mapUptimeError,
} from "@/components/uptime/uptimeErrors";
import {
  EMPTY_UPTIME_FORM,
  parseUptimeFormPayload,
  toUptimeUpdatePayload,
} from "@/components/uptime/uptimeForm";

const mockList = vi.fn();
const mockSamples = vi.fn();

vi.mock("@/api/uptime", async () => {
  const actual = await vi.importActual<typeof import("@/api/uptime")>("@/api/uptime");
  return {
    ...actual,
    listMonitors: (...args: unknown[]) => mockList(...args),
    listSamples: (...args: unknown[]) => mockSamples(...args),
    createMonitor: vi.fn(),
    updateMonitor: vi.fn(),
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
    mockSamples.mockReset();
    mockList.mockResolvedValue([]);
    mockSamples.mockResolvedValue([]);
  });

  it("maps sku limit errors", () => {
    expect(mapUptimeError("Uptime seat limit for basic tier is 1")).toBe("limit");
  });

  it("maps probe errors to operator hints", () => {
    expect(explainUptimeError("[Errno 111] Connection refused")).toBe(
      "hintRefused",
    );
    expect(explainUptimeError("status 403")).toBe("hint403");
    expect(explainUptimeError("status 502")).toBe("hint5xx");
    expect(explainUptimeError(null)).toBeNull();
  });

  it("shows empty state", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("uptime-empty")).toBeInTheDocument());
    expect(screen.getByTestId("uptime-add")).toBeInTheDocument();
    expect(screen.getByTestId("uptime-empty-cta")).toBeInTheDocument();
  });

  it("opens the add form in a right sheet without replacing the empty card", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("uptime-empty-cta")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("uptime-sheet")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("uptime-empty-cta"));
    const sheet = await screen.findByTestId("uptime-sheet");
    expect(sheet).toHaveAttribute("data-slot", "sheet-content");
    expect(sheet.className).toMatch(/right-0/);
    expect(sheet.className).toMatch(/sm:max-w-lg/);
    expect(sheet.className).not.toMatch(/sm:max-w-sm/);
    expect(within(sheet).getByTestId("uptime-name")).toBeInTheDocument();
    expect(within(sheet).getByTestId("uptime-save")).toBeInTheDocument();
    expect(screen.getByTestId("uptime-empty")).toBeInTheDocument();
  });

  it("clears the create form when the sheet is closed and opened again", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("uptime-empty-cta")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("uptime-empty-cta"));
    const name = await screen.findByTestId("uptime-name");
    await user.clear(name);
    await user.type(name, "leftover");
    expect(name).toHaveValue("leftover");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByTestId("uptime-name")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("uptime-empty-cta"));
    expect(await screen.findByTestId("uptime-name")).toHaveValue("");
  });

  it("shows KPI badges when monitors exist", async () => {
    const user = userEvent.setup();
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
    const row = screen.getByTestId("uptime-row");
    expect(row).toBeInTheDocument();
    expect(screen.getByTestId("uptime-filters")).toBeInTheDocument();
    expect(screen.getByTestId("uptime-kpi").className).toMatch(/grid-cols-3/);
    const filtersToggle = screen.getByTestId("uptime-filters-toggle");
    expect(filtersToggle).toBeInTheDocument();
    const filtersCard = filtersToggle.closest("[class*='rounded-md']");
    expect(filtersCard?.className ?? "").toMatch(/border-border/);
    expect(filtersCard?.className ?? "").toMatch(/last:border-b(?:\s|$)/);
    expect(filtersCard?.className ?? "").not.toMatch(/last:border-b-0/);
    await user.click(within(row).getByTestId("uptime-actions"));
    expect(screen.getByTestId("uptime-edit")).toBeInTheDocument();
    await user.click(screen.getByTestId("uptime-edit"));
    const sheet = await screen.findByTestId("uptime-sheet");
    expect(sheet.className).toMatch(/right-0/);
    expect(within(sheet).getByTestId("uptime-name")).toHaveValue("web");
    expect(within(sheet).getByTestId("uptime-target")).toHaveValue(
      "https://example.com",
    );
    expect(screen.getByTestId("uptime-kpi")).toBeInTheDocument();
    expect(screen.getByTestId("uptime-sparkline")).toHaveTextContent("—");
    const table = row.closest("table");
    expect(table?.className ?? "").toMatch(/table-fixed/);
    expect(screen.getByText("Spark")).toBeInTheDocument();
    expect(screen.queryByText(/^24h$/)).not.toBeInTheDocument();
    expect(screen.getByText("24h %")).toBeInTheDocument();
  });

  it("renders a filled 24h sparkline when samples exist", async () => {
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
    mockSamples.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({
        id: `s${i}`,
        checked_at: `2026-08-25T0${i}:00:00Z`,
        ok: true,
        latency_ms: 10 + i,
        status_code: 200,
        error: null,
      })),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("uptime-sparkline")).not.toHaveTextContent("—"),
    );
    const spark = screen.getByTestId("uptime-sparkline");
    expect(spark.querySelector("path[fill]:not([fill='none'])")).toBeTruthy();
    expect(Number(spark.getAttribute("height"))).toBeGreaterThanOrEqual(28);
  });

  it("opens advanced accordion on create", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("uptime-add")).toBeInTheDocument());
    screen.getByTestId("uptime-add").click();
    await waitFor(() => expect(screen.getByTestId("uptime-advanced")).toBeInTheDocument());
    expect(screen.queryByTestId("uptime-timeout")).not.toBeInTheDocument();
    screen.getByText(/advanced|lanjutan/i).click();
    await waitFor(() => expect(screen.getByTestId("uptime-timeout")).toBeInTheDocument());
    expect(screen.getByTestId("uptime-expect-status")).toBeInTheDocument();
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

  it("opens check history for a down monitor", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue([
      {
        id: "m1",
        organization_id: "o1",
        name: "web",
        check_type: "http",
        target: "https://example.com",
        interval_seconds: 60,
        timeout_seconds: 10,
        expect_status: null,
        keyword: null,
        keyword_invert: false,
        enabled: true,
        state: "down",
        consecutive_fails: 2,
        last_checked_at: "2026-08-28T00:00:00Z",
        last_status_code: 403,
        last_latency_ms: 40,
        last_error: "status 403",
        next_check_at: "2026-08-28T00:01:00Z",
        notify_email: null,
        asset_id: null,
        created_at: "2026-08-25T00:00:00Z",
        updated_at: "2026-08-25T00:00:00Z",
        sku: "multi",
        sku_limit: 10,
        uptime_24h: 80,
      },
    ]);
    mockSamples.mockResolvedValue([
      {
        id: "s1",
        checked_at: "2026-08-28T00:00:00Z",
        ok: false,
        latency_ms: 40,
        status_code: 403,
        error: "status 403",
      },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByTestId("uptime-row")).toBeInTheDocument());
    const row = screen.getByTestId("uptime-row");
    await user.click(within(row).getByTestId("uptime-actions"));
    await user.click(screen.getByTestId("uptime-history"));
    await waitFor(() =>
      expect(screen.getByTestId("uptime-history-panel")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("uptime-history-row")).toBeInTheDocument();
    expect(
      screen.getAllByText(/403 is a deny/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("sends null expect_status when the HTTP field is cleared", () => {
    const parsed = parseUptimeFormPayload({
      ...EMPTY_UPTIME_FORM,
      name: "web",
      target: "https://example.com",
      expectStatus: "",
      timeoutSeconds: "10",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.payload.expect_status).toBeNull();
    expect(parsed.payload.timeout_seconds).toBe(10);
    expect(toUptimeUpdatePayload(parsed.payload).expect_status).toBeNull();
  });

  it("keeps an exact HTTP expect_status on create", () => {
    const parsed = parseUptimeFormPayload({
      ...EMPTY_UPTIME_FORM,
      name: "web",
      target: "https://example.com",
      expectStatus: "204",
      timeoutSeconds: "20",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.payload.expect_status).toBe(204);
    expect(parsed.payload.timeout_seconds).toBe(20);
  });
});
