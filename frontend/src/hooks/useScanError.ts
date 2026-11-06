import { isAxiosError } from "axios";
import i18n from "@/i18n";
import { apiErrorMessage } from "@/api/apiErrors";

export function useScanError() {
  const handleScanError = (error: unknown): string => {
    if (isAxiosError(error)) {
      const fromApi = apiErrorMessage(error, "");
      if (fromApi) return fromApi;

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
