import { isAxiosError } from "axios";
import type { ApiError } from "@/lib/utils";

export function useScanError() {
  const handleScanError = (error: unknown): string =>
    (isAxiosError(error) && (error as ApiError).response?.data?.detail) ||
    "Failed to start scan. Check your connection.";

  return handleScanError;
}
