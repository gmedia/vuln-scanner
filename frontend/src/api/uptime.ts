import api from "@/api/scans";

export interface UptimeMonitor {
  id: string;
  organization_id: string;
  name: string;
  check_type: "http" | "tcp" | string;
  target: string;
  interval_seconds: number;
  timeout_seconds: number;
  expect_status: number | null;
  keyword: string | null;
  keyword_invert: boolean;
  enabled: boolean;
  state: string;
  consecutive_fails: number;
  last_checked_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  next_check_at: string;
  notify_email: string | null;
  asset_id: string | null;
  created_at: string;
  updated_at: string;
  sku: string | null;
  sku_limit: number | null;
  uptime_24h: number | null;
}

export interface UptimeCreatePayload {
  name: string;
  check_type: "http" | "tcp";
  target: string;
  interval_seconds?: number;
}

export async function listMonitors(): Promise<UptimeMonitor[]> {
  const { data } = await api.get<UptimeMonitor[]>("/api/uptime/monitors");
  return data;
}

export async function createMonitor(
  payload: UptimeCreatePayload,
): Promise<UptimeMonitor> {
  const { data } = await api.post<UptimeMonitor>(
    "/api/uptime/monitors",
    payload,
  );
  return data;
}

export async function deleteMonitor(id: string): Promise<void> {
  await api.delete(`/api/uptime/monitors/${id}`);
}

export async function pauseMonitor(
  id: string,
  enabled: boolean,
): Promise<UptimeMonitor> {
  const { data } = await api.patch<UptimeMonitor>(
    `/api/uptime/monitors/${id}`,
    {
      enabled,
    },
  );
  return data;
}
