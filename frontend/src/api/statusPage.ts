import api from "@/api/scans";

export interface StatusComponent {
  id: string;
  monitor_id: string;
  display_name: string;
  sort_order: number;
  state: string | null;
}

export interface StatusIncidentUpdate {
  id: string;
  body: string;
  status: string;
  created_at: string;
}

export interface StatusIncident {
  id: string;
  title: string;
  impact: string;
  status: string;
  started_at: string;
  resolved_at: string | null;
  created_at: string;
  updates: StatusIncidentUpdate[];
}

export interface StatusPage {
  id: string;
  organization_id: string;
  slug: string;
  title: string;
  published: boolean;
  custom_hostname: string | null;
  hostname_status: string;
  cname_target: string;
  txt_name: string | null;
  txt_value: string | null;
  ssl_status: string | null;
  public_path: string;
  created_at: string;
  updated_at: string;
  components: StatusComponent[];
  incidents: StatusIncident[];
  overall: string | null;
}

export async function getStatusPage(): Promise<StatusPage | null> {
  const { data } = await api.get<StatusPage | null>("/api/status-page");
  return data;
}

export async function upsertStatusPage(payload: {
  slug: string;
  title: string;
}): Promise<StatusPage> {
  const { data } = await api.put<StatusPage>("/api/status-page", payload);
  return data;
}

export async function patchStatusPage(payload: {
  title?: string;
  slug?: string;
  published?: boolean;
  custom_hostname?: string | null;
}): Promise<StatusPage> {
  const { data } = await api.patch<StatusPage>("/api/status-page", payload);
  return data;
}

export async function attachHostname(hostname: string): Promise<StatusPage> {
  const { data } = await api.post<StatusPage>("/api/status-page/hostname", {
    hostname,
  });
  return data;
}

export async function replaceHostname(hostname: string): Promise<StatusPage> {
  const { data } = await api.put<StatusPage>("/api/status-page/hostname", {
    hostname,
  });
  return data;
}

export async function detachHostname(): Promise<StatusPage> {
  const { data } = await api.delete<StatusPage>("/api/status-page/hostname");
  return data;
}

export async function checkHostname(): Promise<StatusPage> {
  const { data } = await api.post<StatusPage>(
    "/api/status-page/hostname/check",
  );
  return data;
}

export async function addComponent(payload: {
  monitor_id: string;
  display_name: string;
  sort_order?: number;
}): Promise<StatusPage> {
  const { data } = await api.post<StatusPage>(
    "/api/status-page/components",
    payload,
  );
  return data;
}

export async function deleteComponent(id: string): Promise<void> {
  await api.delete(`/api/status-page/components/${id}`);
}

export async function createIncident(payload: {
  title: string;
  impact: string;
  status: string;
  body: string;
}): Promise<StatusPage> {
  const { data } = await api.post<StatusPage>(
    "/api/status-page/incidents",
    payload,
  );
  return data;
}

export async function addIncidentUpdate(
  incidentId: string,
  payload: { body: string; status: string },
): Promise<StatusPage> {
  const { data } = await api.post<StatusPage>(
    `/api/status-page/incidents/${incidentId}/updates`,
    payload,
  );
  return data;
}

export async function patchIncident(
  incidentId: string,
  payload: { title?: string; impact?: string },
): Promise<StatusPage> {
  const { data } = await api.patch<StatusPage>(
    `/api/status-page/incidents/${incidentId}`,
    payload,
  );
  return data;
}

export async function deleteIncident(incidentId: string): Promise<void> {
  await api.delete(`/api/status-page/incidents/${incidentId}`);
}
