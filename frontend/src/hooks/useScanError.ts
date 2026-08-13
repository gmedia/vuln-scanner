import { isAxiosError } from "axios";
import type { ApiError } from "@/lib/utils";

const FALLBACK = "Failed to start scan. Check your connection.";

function detailFromBody(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  return undefined;
}

export function useScanError() {
  const handleScanError = (error: unknown): string => {
    if (isAxiosError(error)) {
      const api = error as ApiError;
      const fromJson = detailFromBody(api.response?.data);
      if (fromJson) return fromJson;

      const status = error.response?.status;
      if (status === 413) {
        return "File too large for the server or CDN (often ~100MB via Cloudflare). Try a smaller package.";
      }
      if (status === 502 || status === 503 || status === 504) {
        return "Upload timed out or the origin dropped the request. Retry a smaller file or a faster link.";
      }
      if (
        error.code === "ECONNABORTED" ||
        error.message?.toLowerCase().includes("timeout")
      ) {
        return "Upload timed out. Large APKs may exceed the CDN or proxy limit.";
      }
      if (!error.response) {
        return "Upload was interrupted (network reset or CDN body limit). Try a file under 80MB.";
      }
    }
    return FALLBACK;
  };

  return handleScanError;
}
