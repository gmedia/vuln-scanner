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
