import type { GuardAgent } from "@/api/guard";
import { cn } from "@/lib/utils";

export type GuardTranslate = (
  key: string,
  options?: Record<string, string | number>,
) => string;

export function truncateId(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function formatWhen(iso: string | null, locale: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(locale === "en" ? "en-US" : "id-ID", {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function agentRailClass(agent: GuardAgent): string {
  if (agent.disabled) return "bg-border";
  const status = agent.status.toLowerCase();
  if (status === "active") return "bg-primary";
  if (status === "disconnected") return "bg-amber-500";
  if (status === "pending") return "bg-sky-500";
  return "bg-border";
}

export function tokenRowClass(expired: boolean, revoked: boolean): string {
  return cn(expired && !revoked ? "opacity-60" : undefined);
}
