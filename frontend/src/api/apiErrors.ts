import i18n from "@/i18n";
import type { ApiError } from "@/lib/utils";

type ErrorBody = NonNullable<ApiError["response"]>["data"];

function body(error: unknown): ErrorBody {
  if (!error || typeof error !== "object" || !("response" in error)) {
    return undefined;
  }
  return (error as ApiError).response?.data;
}

export function apiErrorCode(error: unknown): string | undefined {
  const code = body(error)?.code;
  return typeof code === "string" && code.trim() ? code : undefined;
}

export function apiErrorParams(error: unknown): Record<string, string | number> {
  const params = body(error)?.params;
  return params && typeof params === "object" ? params : {};
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  const code = apiErrorCode(error);
  if (code) {
    const translated = i18n.t(`errors:${code}`, {
      ...apiErrorParams(error),
      defaultValue: "",
    });
    if (translated) return translated;
  }
  const detail = body(error)?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  return fallback;
}
