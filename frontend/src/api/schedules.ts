import api from "@/api/scans";

export interface ScanSchedule {
  id: string;
  user_id: string;
  name: string | null;
  scan_type: "ip" | "domain" | string;
  target: string;
  cadence: "weekly" | "monthly" | string;
  timezone: string;
  next_run_at: string;
  last_run_at: string | null;
  last_job_id: string | null;
  enabled: boolean;
  notify_email: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleCreatePayload {
  name?: string;
  scan_type: "ip" | "domain";
  target: string;
  cadence: "weekly" | "monthly";
  timezone?: string;
  notify_email?: string;
  enabled?: boolean;
}

/** Recent jobs for a schedule target (backend matches user+type+target). */
export interface ScheduleRunJob {
  id: string;
  scan_type: string;
  target: string;
  status: string;
  progress?: number;
  created_at?: string;
  completed_at?: string | null;
  credit_cost?: number;
}

export const MAX_ENABLED_SCHEDULES = 10;

export async function listSchedules(): Promise<ScanSchedule[]> {
  const { data } = await api.get<ScanSchedule[]>("/api/schedules");
  return data;
}

export async function createSchedule(
  payload: ScheduleCreatePayload,
): Promise<ScanSchedule> {
  const { data } = await api.post<ScanSchedule>("/api/schedules", payload);
  return data;
}

export async function updateSchedule(
  id: string,
  payload: Partial<ScheduleCreatePayload> & { enabled?: boolean },
): Promise<ScanSchedule> {
  const { data } = await api.patch<ScanSchedule>(
    `/api/schedules/${id}`,
    payload,
  );
  return data;
}

export async function deleteSchedule(id: string): Promise<void> {
  await api.delete(`/api/schedules/${id}`);
}

export async function listScheduleRuns(
  id: string,
  limit = 10,
): Promise<ScheduleRunJob[]> {
  const { data } = await api.get<ScheduleRunJob[]>(
    `/api/schedules/${id}/runs`,
    { params: { limit } },
  );
  return data;
}

/** Map API/worker English errors to Bahasa for attach UX. */
export function mapScheduleError(detail: string | null | undefined): string {
  if (!detail) return "";
  const d = detail.toLowerCase();
  if (d.includes("insufficient credits")) {
    return "Kredit tidak mencukupi. Jadwal dinonaktifkan otomatis.";
  }
  if (
    d.includes("maximum") &&
    (d.includes("10") || d.includes("enabled") || d.includes("schedule"))
  ) {
    return `Batas ${MAX_ENABLED_SCHEDULES} jadwal aktif per organisasi tercapai. Nonaktifkan satu dulu.`;
  }
  if (d.includes("failed to dispatch")) {
    return "Gagal mengantrikan scan. Coba lagi nanti atau hubungi ops.";
  }
  if (d.includes("target is required") || d.includes("field required")) {
    return "Target wajib diisi";
  }
  return detail;
}
