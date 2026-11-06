import { toast } from "sonner";
import { apiErrorMessage } from "@/api/apiErrors";

export function mapUptimeError(message: string): string {
  if (/seat limit/i.test(message)) return "limit";
  if (/already exists/i.test(message)) return "dup";
  if (/not allowed/i.test(message)) return "ssrf";
  return message;
}

export function explainUptimeError(
  error: string | null | undefined,
): string | null {
  if (!error) return null;
  const e = error.toLowerCase();
  if (e.includes("111") || e.includes("connection refused")) return "hintRefused";
  if (e.includes("timed out") || e.includes("timeout")) return "hintTimeout";
  if (/\b403\b/.test(e)) return "hint403";
  if (/\b401\b/.test(e)) return "hint401";
  if (/\b5\d\d\b/.test(e)) return "hint5xx";
  if (/status \d+/.test(e) || e.startsWith("expected ")) return "hintStatus";
  if (e.includes("certificate") || e.includes("ssl") || e.includes("tls")) {
    return "hintTls";
  }
  if (
    e.includes("name or service not known") ||
    e.includes("getaddrinfo") ||
    e.includes("nxdomain") ||
    e.includes("did not resolve")
  ) {
    return "hintDns";
  }
  return null;
}

export function toastUptimeApiError(
  err: unknown,
  limitMessage: string,
): void {
  const detail = apiErrorMessage(err, "");
  if (!detail) return;
  toast.error(mapUptimeError(detail) === "limit" ? limitMessage : detail);
}
