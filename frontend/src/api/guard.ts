import api from "@/api/scans";

export interface GuardStatus {
  enabled: boolean;
  wazuh_group: string | null;
  last_inventory_sync_at: string | null;
  last_alert_sync_at: string | null;
  last_sync_error: string | null;
  degraded: boolean;
}

export interface GuardAgent {
  id: string;
  organization_id: string;
  wazuh_agent_id: string;
  name: string;
  status: string;
  ip: string | null;
  version: string | null;
  last_keep_alive: string | null;
  synced_at: string;
  created_at: string;
}

export interface GuardAlert {
  id: string;
  organization_id: string;
  external_id: string;
  rule_id: string | null;
  rule_level: number;
  rule_description: string;
  agent_wazuh_id: string | null;
  agent_name: string | null;
  occurred_at: string;
  synced_at: string;
  created_at: string;
}

export interface GuardEnrollTokenMeta {
  id: string;
  label: string | null;
  expires_at: string;
  revoked_at: string | null;
  used_at: string | null;
  created_at: string;
}

export interface GuardEnrollTokenCreated extends GuardEnrollTokenMeta {
  token: string;
}

export async function getGuardStatus(): Promise<GuardStatus> {
  const { data } = await api.get<GuardStatus>("/api/guard/status");
  return data;
}

export async function enableGuard(): Promise<GuardStatus> {
  const { data } = await api.post<GuardStatus>("/api/guard/enable");
  return data;
}

export async function listGuardAgents(): Promise<GuardAgent[]> {
  const { data } = await api.get<GuardAgent[]>("/api/guard/agents");
  return data;
}

export async function listGuardAlerts(limit = 50): Promise<GuardAlert[]> {
  const { data } = await api.get<GuardAlert[]>("/api/guard/alerts", {
    params: { limit },
  });
  return data;
}

export async function createEnrollToken(
  label?: string,
): Promise<GuardEnrollTokenCreated> {
  const { data } = await api.post<GuardEnrollTokenCreated>(
    "/api/guard/enroll-tokens",
    { label: label || undefined },
  );
  return data;
}

export async function listEnrollTokens(): Promise<GuardEnrollTokenMeta[]> {
  const { data } = await api.get<GuardEnrollTokenMeta[]>(
    "/api/guard/enroll-tokens",
  );
  return data;
}

export async function revokeEnrollToken(id: string): Promise<void> {
  await api.delete(`/api/guard/enroll-tokens/${id}`);
}

export async function syncGuard(): Promise<{
  ok: boolean;
  agents?: number;
  alerts?: number;
  error?: string;
}> {
  const { data } = await api.post("/api/guard/sync");
  return data;
}

export function canManageGuard(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}
