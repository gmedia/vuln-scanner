import api from "@/api/scans";
import type { AxiosError } from "axios";

export interface HostWafPolicy {
  id: string;
  organization_id: string;
  site_id: string;
  mode: "off" | "detect" | "protect";
  engine: string;
  paranoia: number;
  updated_by: string;
  created_at: string;
  updated_at: string;
  site_name: string | null;
}

export interface HostWafEvent {
  id: string;
  organization_id: string;
  site_id: string;
  policy_id: string | null;
  action: "log" | "block";
  rule_id: string;
  method: string;
  path: string;
  http_status: number | null;
  created_at: string;
}

export function isHostWafDisabledError(err: unknown): boolean {
  const status = (err as AxiosError | undefined)?.response?.status;
  return status === 404;
}

export async function listHostWafPolicies(): Promise<HostWafPolicy[]> {
  const { data } = await api.get<HostWafPolicy[]>("/api/host/waf/policies");
  return data;
}

export async function upsertHostWafPolicy(
  siteId: string,
  body: { mode: HostWafPolicy["mode"]; engine?: string; paranoia?: number },
): Promise<HostWafPolicy> {
  const { data } = await api.put<HostWafPolicy>(
    `/api/host/waf/sites/${siteId}/policy`,
    {
      mode: body.mode,
      engine: body.engine ?? "mock",
      paranoia: body.paranoia ?? 1,
    },
  );
  return data;
}

export async function listHostWafEvents(
  siteId?: string,
): Promise<HostWafEvent[]> {
  const { data } = await api.get<HostWafEvent[]>("/api/host/waf/events", {
    params: siteId ? { site_id: siteId } : undefined,
  });
  return data;
}

export async function simulateHostWaf(siteId: string): Promise<HostWafEvent> {
  const { data } = await api.post<HostWafEvent>(
    `/api/host/waf/sites/${siteId}/simulate`,
  );
  return data;
}

export interface HostWafSnippet {
  site_id: string;
  engine: string;
  mode: string;
  filename: string;
  content: string;
}

export async function fetchHostWafSnippet(
  siteId: string,
): Promise<HostWafSnippet> {
  const { data } = await api.get<HostWafSnippet>(
    `/api/host/waf/sites/${siteId}/snippet`,
  );
  return data;
}
