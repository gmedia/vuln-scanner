import { useTranslation } from "react-i18next";
import { GuardPulse } from "@/components/guard/guardChrome";
import { SiemRail } from "@/components/siem/siemChrome";
import { Badge } from "@/components/ui/Badge";
import {
  overallLabelKey,
  overallRailClass,
  overallValueClass,
  overallWashClass,
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
  const wash = overallWashClass(overall, published);
  const pulse = published && overall === "operational";
  return (
    <article className="relative overflow-hidden rounded-lg border border-border bg-card pl-4">
      <SiemRail className={overallRailClass(overall, published)} />
      {wash ? (
        <span
          className={cn("pointer-events-none absolute inset-0", wash)}
          aria-hidden
        />
      ) : null}
      <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("overallLabel")}
          </p>
          <div className="flex min-w-0 flex-wrap items-center">
            <p
              className={cn(
                "text-lg font-semibold tracking-tight sm:text-xl",
                overallValueClass(overall, published),
              )}
            >
              {t(overallLabelKey(overall))}
            </p>
            {pulse ? <GuardPulse /> : null}
          </div>
          <p className="truncate text-sm text-muted-foreground">{title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={published ? "completed" : "info"}>
            {published ? t("visibilityOn") : t("visibilityOff")}
          </Badge>
        </div>
      </div>
    </article>
  );
}
