import api from "@/api/scans";
import type { ScanSchedule } from "@/api/schedules";

export interface ScanAsset {
  id: string;
  organization_id: string;
  name: string;
  scan_type: "ip" | "domain" | string;
  target: string;
  notes: string | null;
  tags: string[];
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
  tags?: string[];
}

export async function listAssets(tag?: string): Promise<ScanAsset[]> {
  const { data } = await api.get<ScanAsset[]>("/api/assets", {
    params: tag ? { tag } : undefined,
  });
  return data;
}

export async function createAsset(
  payload: AssetCreatePayload,
): Promise<ScanAsset> {
  const { data } = await api.post<ScanAsset>("/api/assets", payload);
  return data;
}

export type TagColorKey =
  "gray" | "green" | "blue" | "amber" | "red" | "violet";

export const TAG_COLOR_KEYS: TagColorKey[] = [
  "gray",
  "green",
  "blue",
  "amber",
  "red",
  "violet",
];

function parseColorMap(
  colors: Record<string, string> | undefined,
): Record<string, TagColorKey> {
  const out: Record<string, TagColorKey> = {};
  for (const [tag, color] of Object.entries(colors ?? {})) {
    if ((TAG_COLOR_KEYS as string[]).includes(color)) {
      out[tag] = color as TagColorKey;
    }
  }
  return out;
}

export async function fetchTagColors(): Promise<Record<string, TagColorKey>> {
  const { data } = await api.get<{ colors: Record<string, string> }>(
    "/api/assets/tag-colors",
  );
  return parseColorMap(data.colors);
}

export async function patchTagColors(
  colors: Record<string, TagColorKey>,
): Promise<Record<string, TagColorKey>> {
  const { data } = await api.patch<{ colors: Record<string, string> }>(
    "/api/assets/tag-colors",
    { colors },
  );
  return parseColorMap(data.colors);
}

export async function updateAsset(
  id: string,
  payload: Partial<Pick<AssetCreatePayload, "name" | "notes" | "tags">>,
): Promise<ScanAsset> {
  const { data } = await api.patch<ScanAsset>(`/api/assets/${id}`, payload);
  return data;
}

export async function deleteAsset(id: string): Promise<void> {
  await api.delete(`/api/assets/${id}`);
}

export interface AssetPack {
  organization_id: string;
  sku: string | null;
  sku_limit: number;
  count: number;
  assets: Array<{
    id: string;
    name: string;
    scan_type: string;
    target: string;
    schedule_id: string | null;
  }>;
}

export async function fetchAssetPack(): Promise<AssetPack> {
  const { data } = await api.get<AssetPack>("/api/assets/pack");
  return data;
}

export async function fetchAssetPackHtml(lang?: string): Promise<Blob> {
  const { data } = await api.get<Blob>("/api/assets/pack", {
    params: { format: "html", lang },
    responseType: "blob",
  });
  return data;
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
