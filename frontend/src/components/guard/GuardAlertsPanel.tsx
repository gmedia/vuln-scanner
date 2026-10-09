import { Link } from "react-router-dom";
import { Siren } from "lucide-react";
import type { GuardAlert } from "@/api/guard";
import { formatWhen, type GuardTranslate } from "@/components/guard/guardFormat";
import { SiemEmptyIsland } from "@/components/siem/SiemEmptyIsland";
import { SiemRail } from "@/components/siem/siemChrome";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

export function GuardAlertsPanel({
  loading,
  alerts,
  dateLocale,
  t,
}: {
  readonly loading: boolean;
  readonly alerts: readonly GuardAlert[];
  readonly dateLocale: string;
  readonly t: GuardTranslate;
}) {
  return (
    <section
      data-testid="guard-alerts"
      className="rounded-lg border border-border bg-card"
    >
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold tracking-wide">{t("alertsTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("alertsDescription")}
        </p>
      </div>
      <div className="p-4">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-md border border-border p-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="mt-2 h-3 w-32" />
              </div>
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="space-y-3">
            <SiemEmptyIsland icon={Siren} title={t("noAlerts")} />
            <p className="text-center text-xs text-muted-foreground">
              {t("noAlertsHint")}
            </p>
            <div className="flex justify-center">
              <Button variant="outline" size="sm" asChild>
                <Link to="/siem" data-testid="guard-open-siem">
                  {t("openSiem")}
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {alerts.map((al) => (
              <li
                key={al.id}
                className="relative overflow-hidden rounded-lg border border-border bg-destructive/[0.04] px-3 py-2 pl-4 text-sm"
              >
                <SiemRail className="bg-destructive" />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="critical">L{al.rule_level}</Badge>
                  <span className="font-medium">{al.rule_description}</span>
                </div>
                <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {formatWhen(al.occurred_at, dateLocale)}
                  {al.agent_name ? ` · ${al.agent_name}` : ""}
                  {al.rule_id ? ` · rule ${al.rule_id}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
