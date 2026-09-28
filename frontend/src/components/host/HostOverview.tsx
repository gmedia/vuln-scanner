import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FolderKanban, Bot, FileWarning, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export type HostOverviewProps = {
  readonly sku: string;
  readonly count: number;
  readonly limit: number;
  readonly agentsCount: number;
  readonly needsDecision: number;
  readonly waiting: boolean;
  readonly fleetStale: boolean;
  readonly featureOn: boolean;
};

function StatCard({
  icon,
  label,
  value,
  hint,
  testid,
  tone,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: string;
  readonly testid: string;
  readonly tone?: "critical" | "muted";
}) {
  return (
    <Card data-testid={testid}>
      <CardContent className="flex items-start gap-3 pt-4">
        <span
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40",
            tone === "critical" && "border-destructive/40 bg-destructive/10",
          )}
          aria-hidden
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">{label}</span>
          <span className="mt-0.5 block truncate text-lg font-semibold leading-tight text-foreground">
            {value}
          </span>
          {hint ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {hint}
            </span>
          ) : null}
        </span>
      </CardContent>
    </Card>
  );
}

export default function HostOverview({
  sku,
  count,
  limit,
  agentsCount,
  needsDecision,
  waiting,
  fleetStale,
  featureOn,
}: HostOverviewProps) {
  const { t } = useTranslation("host");
  if (!featureOn) return null;
  return (
    <section
      data-testid="host-overview"
      aria-label={t("title")}
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      <StatCard
        icon={<FolderKanban className="h-4 w-4" aria-hidden />}
        label={t("overviewSites")}
        value={t("overviewOf", { count, limit })}
        hint={t("overviewSitesHint", { sku })}
        testid="host-overview-sites"
      />
      <StatCard
        icon={<Bot className="h-4 w-4" aria-hidden />}
        label={t("overviewAgents")}
        value={agentsCount > 0 ? String(agentsCount) : t("overviewNoAgents")}
        testid="host-overview-agents"
      />
      <StatCard
        icon={<FileWarning className="h-4 w-4" aria-hidden />}
        label={t("overviewNeedsDecision")}
        value={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {needsDecision} {t("overviewFilesSuffix")}
            </span>
            {waiting ? (
              <Badge variant="running">{t("overviewWaiting")}</Badge>
            ) : null}
          </span>
        }
        testid="host-overview-decision"
        tone={needsDecision > 0 ? "critical" : undefined}
      />
      <StatCard
        icon={<Activity className="h-4 w-4" aria-hidden />}
        label="Helper"
        value={
          fleetStale ? t("overviewHelperStale") : t("overviewHelperOk")
        }
        testid="host-overview-helper"
        tone={fleetStale ? "critical" : undefined}
      />
    </section>
  );
}
