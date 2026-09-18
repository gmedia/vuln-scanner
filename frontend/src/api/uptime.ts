import api from "@/api/scans";

export type UptimeCheckType = "http" | "tcp" | "heartbeat" | "dns" | "ping";

export interface UptimeMonitor {
  id: string;
  organization_id: string;
  name: string;
  check_type: UptimeCheckType | string;
  target: string;
  interval_seconds: number;
  timeout_seconds: number;
  expect_status: number | null;
  keyword: string | null;
  keyword_invert: boolean;
  http_method?: string;
  request_headers?: Record<string, string> | null;
  request_body?: string | null;
  heartbeat_token_prefix?: string | null;
  last_heartbeat_at?: string | null;
  dns_record?: string | null;
  expected_values?: string[] | null;
  enabled: boolean;
  state: string;
  consecutive_fails: number;
  last_checked_at: string | null;
  last_status_code: number | null;
  last_latency_ms: number | null;
  last_error: string | null;
  next_check_at: string;
  notify_email: string | null;
  asset_id: string | null;
  created_at: string;
  updated_at: string;
  sku: string | null;
  sku_limit: number | null;
  uptime_24h: number | null;
  heartbeat_url?: string | null;
  heartbeat_token?: string | null;
}

export interface UptimeCreatePayload {
  name: string;
  check_type: UptimeCheckType;
  target: string;
  interval_seconds?: number;
  timeout_seconds?: number;
  expect_status?: number | null;
  keyword?: string;
  keyword_invert?: boolean;
  http_method?: string;
  request_headers?: Record<string, string>;
  request_body?: string;
  dns_record?: string;
  expected_values?: string[];
  notify_email?: string;
}

export type UptimeUpdatePayload = Omit<
  UptimeCreatePayload,
  "check_type" | "target"
>;

export interface UptimeSample {
  id: string;
  checked_at: string;
  ok: boolean;
  latency_ms: number | null;
  status_code: number | null;
  error: string | null;
}

export interface UptimeSampleList {
  items: UptimeSample[];
  total: number;
}

export interface UptimeEvent {
  id: string;
  from_state: string;
  to_state: string;
  at: string;
  notified: boolean;
  detail: string | null;
}

export interface UptimeStats {
  uptime_pct: number | null;
  ok_count: number;
  total_count: number;
  from_at: string;
  until_at: string;
}

export type UptimeRange = "6h" | "24h" | "7d";

export interface UptimeWindowParams {
  from?: string;
  until?: string;
  limit?: number;
  offset?: number;
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

export async function updateMonitor(
  id: string,
  payload: UptimeUpdatePayload,
): Promise<UptimeMonitor> {
  const { data } = await api.patch<UptimeMonitor>(
    `/api/uptime/monitors/${id}`,
    payload,
  );
  return data;
}

export async function deleteMonitor(id: string): Promise<void> {
  await api.delete(`/api/uptime/monitors/${id}`);
}

export async function pauseMonitor(id: string): Promise<UptimeMonitor> {
  const { data } = await api.post<UptimeMonitor>(
    `/api/uptime/monitors/${id}/pause`,
  );
  return data;
}

export async function rotateHeartbeatToken(id: string): Promise<UptimeMonitor> {
  const { data } = await api.post<UptimeMonitor>(
    `/api/uptime/monitors/${id}/rotate-token`,
  );
  return data;
}

export async function getMonitor(id: string): Promise<UptimeMonitor> {
  const { data } = await api.get<UptimeMonitor>(`/api/uptime/monitors/${id}`);
  return data;
}

export async function listSamples(
  id: string,
  params?: UptimeWindowParams,
): Promise<UptimeSampleList> {
  const { data } = await api.get<UptimeSampleList>(
    `/api/uptime/monitors/${id}/samples`,
    { params },
  );
  return data;
}

export async function listEvents(
  id: string,
  params?: Pick<UptimeWindowParams, "from" | "until"> & { limit?: number },
): Promise<UptimeEvent[]> {
  const { data } = await api.get<UptimeEvent[]>(
    `/api/uptime/monitors/${id}/events`,
    { params },
  );
  return data;
}

export async function getMonitorStats(
  id: string,
  params?: Pick<UptimeWindowParams, "from" | "until">,
): Promise<UptimeStats> {
  const { data } = await api.get<UptimeStats>(
    `/api/uptime/monitors/${id}/stats`,
    { params },
  );
  return data;
}
