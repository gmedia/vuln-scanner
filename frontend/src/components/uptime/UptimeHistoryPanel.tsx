import { useTranslation } from "react-i18next";
import type { UptimeMonitor, UptimeSample } from "@/api/uptime";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { explainUptimeError } from "@/components/uptime/uptimeErrors";

export function UptimeHistoryPanel({
  monitor,
  rows,
  loading,
}: {
  readonly monitor: UptimeMonitor;
  readonly rows: readonly UptimeSample[];
  readonly loading: boolean;
}) {
  const { t } = useTranslation("uptime");
  return (
    <Card data-testid="uptime-history-panel">
      <CardHeader>
        <CardTitle className="text-sm tracking-wide">
          {t("historyTitle", { name: monitor.name })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("probeRule")}</p>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colTime")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead className="text-right">{t("latency")}</TableHead>
                  <TableHead>{t("lastError")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id} data-testid="uptime-history-row">
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {new Date(s.checked_at)
                        .toISOString()
                        .replace("T", " ")
                        .slice(0, 19)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.ok ? "completed" : "critical"}>
                        {s.ok
                          ? t("stateUp")
                          : s.status_code != null
                            ? String(s.status_code)
                            : t("stateDown")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {s.latency_ms != null ? `${s.latency_ms}ms` : "—"}
                    </TableCell>
                    <TableCell className="max-w-md text-xs">
                      {s.error ? (
                        <div className="space-y-0.5">
                          <p className="truncate text-destructive">{s.error}</p>
                          {explainUptimeError(s.error) ? (
                            <p className="text-muted-foreground">
                              {t(explainUptimeError(s.error) as string)}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
