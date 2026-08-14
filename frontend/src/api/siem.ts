import api from "@/api/scans";
import type { AxiosError } from "axios";

export interface SiemStatus {
  enabled: boolean;
  indexer_reachable: boolean;
  degraded: boolean;
  last_error: string | null;
  search_min_level: number;
  max_lookback_hours: number;
  max_page_size: number;
  include_full_log: boolean;
  wazuh_group: string | null;
}

export interface SiemEvent {
  external_id: string;
  rule_id: string | null;
  rule_level: number;
  rule_description: string;
  agent_wazuh_id: string | null;
  agent_name: string | null;
  occurred_at: string;
}

export interface SiemEventList {
  items: SiemEvent[];
  degraded: boolean;
  last_error: string | null;
}

export interface SiemCaseEvent {
  id: string;
  external_id: string;
  rule_id: string | null;
  rule_level: number;
  rule_description: string;
  agent_wazuh_id: string | null;
  agent_name: string | null;
  occurred_at: string;
}

export interface SiemCaseNote {
  id: string;
  author_user_id: string;
  body: string;
  created_at: string;
}

export interface SiemCase {
  id: string;
  organization_id: string;
  title: string;
  status: string;
  severity: number | null;
  created_by_user_id: string;
  assignee_user_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  events: SiemCaseEvent[];
  notes: SiemCaseNote[];
}

export interface SiemCaseList {
  items: SiemCase[];
}

export interface SiemEventFilters {
  since?: string;
  until?: string;
  min_level?: number;
  max_level?: number;
  agent_id?: string;
  q?: string;
  limit?: number;
}

export function isSiemDisabledError(err: unknown): boolean {
  const status = (err as AxiosError | undefined)?.response?.status;
  return status === 404;
}

export async function getSiemStatus(): Promise<SiemStatus> {
  const { data } = await api.get<SiemStatus>("/api/siem/status");
  return data;
}

export async function listSiemEvents(
  filters: SiemEventFilters = {},
): Promise<SiemEventList> {
  const { data } = await api.get<SiemEventList>("/api/siem/events", {
    params: filters,
  });
  return data;
}

export async function getSiemEvent(externalId: string): Promise<SiemEvent> {
  const { data } = await api.get<SiemEvent>(
    `/api/siem/events/${encodeURIComponent(externalId)}`,
  );
  return data;
}

export async function listSiemCases(): Promise<SiemCaseList> {
  const { data } = await api.get<SiemCaseList>("/api/siem/cases");
  return data;
}

export async function getSiemCase(id: string): Promise<SiemCase> {
  const { data } = await api.get<SiemCase>(`/api/siem/cases/${id}`);
  return data;
}

export async function createSiemCase(body: {
  title: string;
  external_id?: string;
  assignee_user_id?: string;
}): Promise<SiemCase> {
  const { data } = await api.post<SiemCase>("/api/siem/cases", body);
  return data;
}

export async function patchSiemCase(
  id: string,
  body: {
    title?: string;
    status?: "open" | "ack" | "closed";
    assignee_user_id?: string;
  },
): Promise<SiemCase> {
  const { data } = await api.patch<SiemCase>(`/api/siem/cases/${id}`, body);
  return data;
}

export async function attachSiemCaseEvent(
  id: string,
  externalId: string,
): Promise<SiemCase> {
  const { data } = await api.post<SiemCase>(`/api/siem/cases/${id}/events`, {
    external_id: externalId,
  });
  return data;
}

export async function addSiemCaseNote(
  id: string,
  body: string,
): Promise<SiemCase> {
  const { data } = await api.post<SiemCase>(`/api/siem/cases/${id}/notes`, {
    body,
  });
  return data;
}

export function canCreateSiemCase(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

export function canManageSiemCase(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}
