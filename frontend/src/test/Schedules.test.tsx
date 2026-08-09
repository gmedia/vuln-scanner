import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Schedules, { mapScheduleError } from "@/pages/Schedules";

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockRuns = vi.fn();
const mockDownload = vi.fn();

vi.mock("@/api/schedules", async () => {
  const actual = await vi.importActual<typeof import("@/api/schedules")>(
    "@/api/schedules",
  );
  return {
    ...actual,
    listSchedules: (...args: unknown[]) => mockList(...args),
    createSchedule: (...args: unknown[]) => mockCreate(...args),
    updateSchedule: (...args: unknown[]) => mockUpdate(...args),
    deleteSchedule: (...args: unknown[]) => mockDelete(...args),
    listScheduleRuns: (...args: unknown[]) => mockRuns(...args),
  };
});

vi.mock("@/api/scans", async () => {
  const actual = await vi.importActual<typeof import("@/api/scans")>(
    "@/api/scans",
  );
  return {
    ...actual,
    downloadFile: (...args: unknown[]) => mockDownload(...args),
  };
});

function renderAt(path = "/schedules") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/schedules" element={<Schedules />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sampleSchedule = {
  id: "sched-1",
  user_id: "u1",
  name: "Weekly external",
  scan_type: "domain",
  target: "example.com",
  cadence: "weekly",
  timezone: "Asia/Jakarta",
  next_run_at: "2026-08-10T19:00:00Z",
  last_run_at: "2026-08-03T19:00:00Z",
  last_job_id: "job-1",
  enabled: true,
  notify_email: "ops@example.com",
  last_error: null as string | null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-03T19:00:00Z",
};

describe("mapScheduleError", () => {
  it("maps insufficient credits to Bahasa", () => {
    expect(mapScheduleError("Insufficient credits")).toMatch(/Kredit tidak/);
  });

  it("maps max enabled cap to Bahasa", () => {
    expect(
      mapScheduleError("Maximum 10 enabled schedules per user"),
    ).toMatch(/Batas 10/);
  });

  it("passes through unknown messages", () => {
    expect(mapScheduleError("Something else")).toBe("Something else");
  });
});

describe("Schedules page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([]);
    mockRuns.mockResolvedValue([]);
  });

  it("renders Bahasa Indonesia chrome", async () => {
    renderAt();
    expect(await screen.findByText("Jadwal scan")).toBeInTheDocument();
    expect(screen.getByText("Jadwal baru")).toBeInTheDocument();
    expect(screen.getByText(/Kuota jadwal aktif/)).toBeInTheDocument();
    expect(screen.getByText("0/10")).toBeInTheDocument();
  });

  it("prefills target and scan_type from URL", async () => {
    renderAt("/schedules?target=acme.example.com&scan_type=ip");
    const target = await screen.findByLabelText("Target");
    expect(target).toHaveValue("acme.example.com");
  });

  it("shows credit-disable callout with credit-history link", async () => {
    mockList.mockResolvedValue([
      {
        ...sampleSchedule,
        enabled: false,
        last_error: "Insufficient credits",
      },
    ]);
    renderAt();
    expect(
      await screen.findByText(/Kredit tidak mencukupi/),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Lihat riwayat kredit/i });
    expect(link).toHaveAttribute("href", "/credit-history");
  });

  it("disables create when at cap", async () => {
    mockList.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        ...sampleSchedule,
        id: `s-${i}`,
        target: `t${i}.example.com`,
        last_job_id: null,
        last_error: null,
        enabled: true,
      })),
    );
    renderAt();
    expect(await screen.findByText("10/10")).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: /Buat jadwal/i });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/Batas 10 jadwal aktif tercapai/)).toBeInTheDocument();
  });

  it("expands recent runs and links to scan detail", async () => {
    mockList.mockResolvedValue([sampleSchedule]);
    mockRuns.mockResolvedValue([
      {
        id: "job-99",
        scan_type: "domain",
        target: "example.com",
        status: "completed",
        progress: 100,
        result_summary: null,
        celery_task_id: null,
        started_at: null,
        completed_at: null,
        created_at: "2026-08-03T19:00:00Z",
      },
    ]);
    const user = userEvent.setup();
    renderAt();
    await screen.findByText("Weekly external");
    await user.click(screen.getByRole("button", { name: /Riwayat scan/i }));
    await waitFor(() => expect(mockRuns).toHaveBeenCalledWith("sched-1", 10));
    const runLink = await screen.findByRole("link", { name: /buka scan/i });
    expect(runLink).toHaveAttribute("href", "/scan/job-99");
  });

  it("downloads executive report from last_job_id", async () => {
    mockList.mockResolvedValue([sampleSchedule]);
    const user = userEvent.setup();
    renderAt();
    await screen.findByText("Weekly external");
    await user.click(
      screen.getByRole("button", { name: /Unduh laporan eksekutif/i }),
    );
    expect(mockDownload).toHaveBeenCalledWith("job-1", "executive");
  });

  it("surfaces toggle errors", async () => {
    mockList.mockResolvedValue([
      { ...sampleSchedule, enabled: false, last_job_id: null },
    ]);
    mockUpdate.mockRejectedValue({
      response: { data: { detail: "Maximum 10 enabled schedules per user" } },
      isAxiosError: true,
    });
    const user = userEvent.setup();
    renderAt();
    await screen.findByText("Weekly external");
    await user.click(screen.getByRole("button", { name: /Aktifkan/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Batas 10/),
    );
  });
});
