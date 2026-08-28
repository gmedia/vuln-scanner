import axios from "axios";
import { useAuthStore } from "@/store/authStore";

const API_BASE = import.meta.env.VITE_API_URL || "";

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // E2E test header: bypasses IP rate limiting so Playwright browser requests
  // don't exhaust the 300 req/hour quota during test suite runs.
  config.headers["X-E2E-Test"] = "true";
  return config;
});

export default api;

export interface ScanJob {
  id: string;
  scan_type: string;
  target: string;
  status: string;
  progress: number;
  result_summary: {
    total_findings?: number;
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
    info?: number;
    error?: string;
    [key: string]: unknown;
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
  impact: string | null;
  attacker_benefit: string | null;
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

export interface ScanDiff {
  compared_to_job_id: string | null;
  new_critical: number;
  new_high: number;
  resolved: number;
  worsened: number;
  unchanged: number;
  new_finding_ids: string[];
  resolved_finding_ids: string[];
}

export async function startIpScan(
  target: string,
  ports?: string,
): Promise<ScanJob> {
  const { data } = await api.post<ScanJob>("/api/scan/ip", {
    target,
    ports: ports || "1-1000",
  });
  return data;
}

export async function startDomainScan(domain: string): Promise<ScanJob> {
  const { data } = await api.post<ScanJob>("/api/scan/domain", { domain });
  return data;
}

export async function startMobileScan(
  file: File,
  platform: "android" | "ios",
): Promise<ScanJob> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("platform", platform);
  const { data } = await api.post<ScanJob>("/api/scan/mobile", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 600_000,
  });
  return data;
}

export async function getScan(jobId: string): Promise<ScanJobDetail> {
  const { data } = await api.get<ScanJobDetail>(`/api/scan/${jobId}`);
  return data;
}

export async function getScanFindings(
  jobId: string,
  page = 1,
  limit = 50,
): Promise<PaginatedResponse<ScanFinding>> {
  const { data } = await api.get<PaginatedResponse<ScanFinding>>(
    `/api/scan/${jobId}/findings`,
    { params: { page, limit } },
  );
  return data;
}

export async function getScanFinding(
  jobId: string,
  findingId: string,
): Promise<ScanFinding> {
  const { data } = await api.get<ScanFinding>(
    `/api/scan/${jobId}/findings/${findingId}`,
  );
  return data;
}

export async function getScanDiff(jobId: string): Promise<ScanDiff> {
  const { data } = await api.get<ScanDiff>(`/api/scan/${jobId}/diff`);
  return data;
}

export async function getScanHistory(
  page = 1,
  limit = 20,
  scanType?: string,
): Promise<PaginatedResponse<ScanJob>> {
  const params: Record<string, string | number> = { page, limit };
  if (scanType) params.scan_type = scanType;
  const { data } = await api.get<PaginatedResponse<ScanJob>>(
    "/api/scan/history",
    { params },
  );
  return data;
}

export async function downloadFile(
  jobId: string,
  format: "json" | "html" | "executive",
): Promise<void> {
  const stored = localStorage.getItem("sinexis.locale");
  const lang = stored === "en" || stored === "id" ? stored : "id";
  const resp = await api.get(`/api/scan/${jobId}/export`, {
    params: { format, ...(format === "executive" ? { lang } : {}) },
    responseType: "blob",
  });
  const ext =
    format === "json"
      ? "json"
      : format === "executive"
        ? "executive.html"
        : "html";
  const url = window.URL.createObjectURL(new Blob([resp.data]));
  const a = document.createElement("a");
  a.href = url;
  a.download = `scan_${jobId}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export function getWsUrl(jobId: string): string {
  const wsBase = import.meta.env.VITE_WS_URL || "";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return wsBase
    ? `${wsBase}/ws/scan/${jobId}`
    : `${protocol}//${host}/ws/scan/${jobId}`;
}
