import api from "@/api/scans";
import type { ScanSchedule } from "@/api/schedules";

export interface ScanAsset {
  id: string;
  organization_id: string;
  name: string;
  scan_type: "ip" | "domain" | string;
  target: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  schedule_id: string | null;
  sku: string | null;
  sku_limit: number | null;
}

export interface AssetCreatePayload {
  name: string;
  scan_type: "ip" | "domain";
  target: string;
  notes?: string;
}

export async function listAssets(): Promise<ScanAsset[]> {
  const { data } = await api.get<ScanAsset[]>("/api/assets");
  return data;
}

export async function createAsset(
  payload: AssetCreatePayload,
): Promise<ScanAsset> {
  const { data } = await api.post<ScanAsset>("/api/assets", payload);
  return data;
}

export async function updateAsset(
  id: string,
  payload: Partial<Pick<AssetCreatePayload, "name" | "notes">>,
): Promise<ScanAsset> {
  const { data } = await api.patch<ScanAsset>(`/api/assets/${id}`, payload);
  return data;
}

export async function deleteAsset(id: string): Promise<void> {
  await api.delete(`/api/assets/${id}`);
}

export async function createAssetSchedule(
  id: string,
  payload: {
    cadence: "weekly" | "monthly";
    timezone?: string;
    enabled?: boolean;
  },
): Promise<ScanSchedule> {
  const { data } = await api.post<ScanSchedule>(
    `/api/assets/${id}/schedules`,
    payload,
  );
  return data;
}
