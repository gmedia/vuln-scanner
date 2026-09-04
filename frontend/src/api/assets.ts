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
  guard_agent_id?: string | null;
  guard_agent_name?: string | null;
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

export const TAG_COLOR_KEYS = [
  "gray",
  "green",
  "blue",
  "amber",
  "red",
  "violet",
] as const;

export type TagNamedColor = (typeof TAG_COLOR_KEYS)[number];
export type TagColorValue = TagNamedColor | `#${string}`;

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/;

export function isTagColorValue(value: string): value is TagColorValue {
  return (
    (TAG_COLOR_KEYS as readonly string[]).includes(value) ||
    HEX_COLOR_RE.test(value)
  );
}

function parseColorMap(
  colors: Record<string, string> | undefined,
): Record<string, TagColorValue> {
  const out: Record<string, TagColorValue> = {};
  for (const [tag, color] of Object.entries(colors ?? {})) {
    const c = color.trim().toLowerCase();
    if (isTagColorValue(c)) out[tag] = c;
  }
  return out;
}

export async function fetchTagColors(): Promise<Record<string, TagColorValue>> {
  const { data } = await api.get<{ colors: Record<string, string> }>(
    "/api/assets/tag-colors",
  );
  return parseColorMap(data.colors);
}

export async function patchTagColors(
  colors: Record<string, TagColorValue>,
): Promise<Record<string, TagColorValue>> {
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
