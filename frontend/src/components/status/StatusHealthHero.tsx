import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import {
  overallLabelKey,
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
  return (
    <article className="rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("overallLabel")}
          </p>
          <p
            className={cn(
              "text-lg font-semibold tracking-tight sm:text-xl",
              overallValueClass(overall, published),
            )}
          >
            {t(overallLabelKey(overall))}
          </p>
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
