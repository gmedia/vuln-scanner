import { Radio } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { LiveDot } from "@/components/uptime/UptimeChrome";
import {
  overallLabelKey,
  overallRailClass,
  overallValueClass,
} from "@/components/status/statusChrome";
import { cn } from "@/lib/utils";

export function StatusHealthHero({
  title,
  published,
  overall,
}: {
  readonly title: string;
  readonly published: boolean;
  readonly overall: string | null;
}) {
  const { t } = useTranslation("statusPage");
  const live = published && overall === "operational";
  const outage = overall === "major" || overall === "partial";
  return (
    <article className="relative overflow-hidden rounded-lg border border-border bg-card">
      <div
        className={cn("h-0.5", overallRailClass(overall, published))}
        aria-hidden
      />
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              outage ? "bg-destructive/15" : "bg-primary/15",
            )}
          >
            <Radio
              className={cn(
                "h-5 w-5",
                outage ? "text-destructive" : "text-primary",
              )}
            />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("overallLabel")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {live ? <LiveDot /> : null}
              {outage ? <LiveDot tone="destructive" /> : null}
              <p
                className={cn(
                  "text-lg font-semibold tracking-tight sm:text-xl",
                  overallValueClass(overall, published),
                )}
              >
                {t(overallLabelKey(overall))}
              </p>
            </div>
            <p className="truncate text-sm text-muted-foreground">{title}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pl-[3.25rem] sm:pl-0">
          <Badge variant={published ? "completed" : "info"}>
            {published ? t("visibilityOn") : t("visibilityOff")}
          </Badge>
        </div>
      </div>
    </article>
  );
}
