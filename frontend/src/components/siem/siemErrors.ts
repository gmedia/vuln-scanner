import { apiErrorCode } from "@/api/apiErrors";

export { apiErrorMessage as apiDetail } from "@/api/apiErrors";
import type { ApiError } from "@/lib/utils";

const AUTH_SESSION_CODES = new Set(["auth_missing_token", "auth_invalid_token"]);

const AUTH_SESSION_DETAILS = new Set([
  "Invalid or expired token",
  "Missing Authorization header",
  "Invalid Authorization header format. Expected: Bearer <token>",
  "Invalid token type: access token required",
]);

export function isAuthSessionError(err: unknown): boolean {
  const code = apiErrorCode(err);
  if (code && AUTH_SESSION_CODES.has(code)) return true;
  if (!err || typeof err !== "object" || !("response" in err)) return false;
  const res = (err as ApiError).response;
  if (res?.status === 401) return true;
  const detail = res?.data?.detail;
  return typeof detail === "string" && AUTH_SESSION_DETAILS.has(detail);
}

