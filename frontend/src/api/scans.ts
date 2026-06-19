import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "";
const API_KEY = import.meta.env.VITE_API_KEY || "";

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
    ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
  },
});

export default api;

export interface ScanJob {
  id: string;
  scan_type: string;
  target: string;
  status: string;
  progress: number;
  result_summary: {
    total_findings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  } | null;
  celery_task_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ScanFinding {
  id: string;
  job_id: string;
  severity: string;
  category: string | null;
  title: string;
  description: string | null;
  cve_id: string | null;
  cvss_score: number | null;
  remediation: string | null;
  raw_data: Record<string, unknown> | null;
  found_at: string;
}

export interface ScanJobDetail extends ScanJob {
  findings: ScanFinding[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export async function startIpScan(target: string, ports?: string): Promise<ScanJob> {
  const { data } = await api.post<ScanJob>("/api/scan/ip", { target, ports: ports || "1-1000" });
  return data;
}

export async function startDomainScan(domain: string): Promise<ScanJob> {
  const { data } = await api.post<ScanJob>("/api/scan/domain", { domain });
  return data;
}

export async function startMobileScan(file: File, platform: "android" | "ios"): Promise<ScanJob> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("platform", platform);
  const { data } = await api.post<ScanJob>("/api/scan/mobile", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function getScan(jobId: string): Promise<ScanJobDetail> {
  const { data } = await api.get<ScanJobDetail>(`/api/scan/${jobId}`);
  return data;
}

export async function getScanFindings(jobId: string): Promise<ScanFinding[]> {
  const { data } = await api.get<ScanFinding[]>(`/api/scan/${jobId}/findings`);
  return data;
}

export async function getScanHistory(
  page = 1,
  limit = 20,
  scanType?: string
): Promise<PaginatedResponse<ScanJob>> {
  const params: Record<string, string | number> = { page, limit };
  if (scanType) params.scan_type = scanType;
  const { data } = await api.get<PaginatedResponse<ScanJob>>("/api/scan/history", { params });
  return data;
}

export function getWsUrl(jobId: string): string {
  const wsBase = import.meta.env.VITE_WS_URL || "";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const url = wsBase
    ? `${wsBase}/ws/scan/${jobId}`
    : `${protocol}//${host}/ws/scan/${jobId}`;
  const params = new URLSearchParams();
  if (API_KEY) params.set("api_key", API_KEY);
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}
