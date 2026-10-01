import type { ApiError } from "@/lib/utils";

const AUTH_SESSION_DETAILS = new Set([
  "Invalid or expired token",
  "Missing Authorization header",
  "Invalid Authorization header format. Expected: Bearer <token>",
  "Invalid token type: access token required",
]);

export function isAuthSessionError(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("response" in err)) return false;
  const res = (err as ApiError).response;
  if (res?.status === 401) return true;
  const detail = res?.data?.detail;
  return typeof detail === "string" && AUTH_SESSION_DETAILS.has(detail);
}

export function apiDetail(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const detail = (err as ApiError).response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}
