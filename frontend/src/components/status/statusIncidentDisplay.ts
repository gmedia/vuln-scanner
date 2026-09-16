import { htmlLang, isAppLocale } from "@/i18n/locales";
import i18n from "@/i18n";

export function formatStartedAt(iso: string): string {
  const lng = isAppLocale(i18n.language) ? htmlLang(i18n.language) : "id";
  return new Date(iso).toLocaleString(lng === "en" ? "en-US" : "id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function impactBadge(impact: string) {
  if (impact === "critical") return "critical" as const;
  if (impact === "major") return "high" as const;
  if (impact === "minor") return "medium" as const;
  return "info" as const;
}

export function statusBadge(status: string) {
  if (status === "resolved") return "completed" as const;
  if (status === "investigating") return "pending" as const;
  if (status === "identified") return "high" as const;
  return "info" as const;
}
