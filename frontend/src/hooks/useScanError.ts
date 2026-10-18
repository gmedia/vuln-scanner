import { isAxiosError } from "axios";
import i18n from "@/i18n";
import type { ApiError } from "@/lib/utils";

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
        return i18n.t("scan:errScanTooLarge");
      }
      if (status === 502 || status === 503 || status === 504) {
        return i18n.t("scan:errScanGateway");
      }
      if (
        error.code === "ECONNABORTED" ||
        error.message?.toLowerCase().includes("timeout")
      ) {
        return i18n.t("scan:errScanTimeout");
      }
      if (!error.response) {
        return i18n.t("scan:errScanInterrupted");
      }
    }
    return i18n.t("scan:errScanFallback");
  };

  return handleScanError;
}
