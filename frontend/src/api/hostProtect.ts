import api from "@/api/scans";
import type { AxiosError } from "axios";

export interface HostSite {
  id: string;
  organization_id: string;
  guard_agent_id: string;
  asset_id: string | null;
  name: string;
  root_path: string;
  cms_hint: string | null;
  enabled: boolean;
  auto_quarantine: boolean;
  scan_interval: "daily" | "hourly";
  created_by: string;
  created_at: string;
  updated_at: string;
  sku: string | null;
  sku_limit: number | null;
}

export interface HostScan {
  id: string;
  organization_id: string;
  site_id: string;
  status: string;
  trigger: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  hit_count: number;
  created_at: string;
}

export interface HostHit {
  id: string;
  organization_id: string;
  site_id: string;
  scan_id: string | null;
  rel_path: string;
  class: string;
  engine: string;
  rule_id: string;
  status: string;
  sha256: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

export interface HostSiteCreatePayload {
  name: string;
  guard_agent_id: string;
  root_path: string;
  cms_hint?: "wordpress" | "laravel" | "unknown";
  asset_id?: string;
  enabled?: boolean;
  auto_quarantine?: boolean;
  scan_interval?: "daily" | "hourly";
}

export async function updateHostSite(
  id: string,
  payload: { scan_interval?: "daily" | "hourly" },
): Promise<HostSite> {
  const { data } = await api.patch<HostSite>(`/api/host/sites/${id}`, payload);
  return data;
}

export function isHostProtectDisabledError(err: unknown): boolean {
  const status = (err as AxiosError | undefined)?.response?.status;
  return status === 404;
}

export async function listHostSites(): Promise<HostSite[]> {
  const { data } = await api.get<HostSite[]>("/api/host/sites");
  return data;
}

export async function createHostSite(
  payload: HostSiteCreatePayload,
): Promise<HostSite> {
  const { data } = await api.post<HostSite>("/api/host/sites", payload);
  return data;
}

export async function deleteHostSite(id: string): Promise<void> {
  await api.delete(`/api/host/sites/${id}`);
}

export async function enqueueHostScan(siteId: string): Promise<HostScan> {
  const { data } = await api.post<HostScan>(`/api/host/sites/${siteId}/scan`);
  return data;
}

export async function listHostScans(siteId: string): Promise<HostScan[]> {
  const { data } = await api.get<HostScan[]>(`/api/host/sites/${siteId}/scans`);
  return data;
}

export async function listHostHits(params?: {
  site_id?: string;
  status?: string;
  class?: string;
}): Promise<HostHit[]> {
  const { data } = await api.get<HostHit[]>("/api/host/hits", { params });
  return data;
}

export async function quarantineHostHit(id: string): Promise<HostHit> {
  const { data } = await api.post<HostHit>(`/api/host/hits/${id}/quarantine`);
  return data;
}

export async function restoreHostHit(id: string): Promise<HostHit> {
  const { data } = await api.post<HostHit>(`/api/host/hits/${id}/restore`);
  return data;
}

export async function ignoreHostHit(id: string): Promise<HostHit> {
  const { data } = await api.post<HostHit>(`/api/host/hits/${id}/ignore`);
  return data;
}
