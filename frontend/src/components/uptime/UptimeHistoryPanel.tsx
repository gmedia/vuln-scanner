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
import i18n from "@/i18n";
import { htmlLang, isAppLocale } from "@/i18n/locales";

function formatSampleTime(iso: string): string {
  const lng = isAppLocale(i18n.language) ? htmlLang(i18n.language) : "id";
  return new Date(iso).toLocaleString(lng === "en" ? "en-US" : "id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
          <>
            <div className="space-y-2 md:hidden" data-testid="uptime-history-mobile">
              {rows.map((s) => (
                <div
                  key={s.id}
                  data-testid="uptime-history-row"
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-xs">
                      {formatSampleTime(s.checked_at)}
                    </p>
                    <Badge variant={s.ok ? "completed" : "critical"}>
                      {s.ok
                        ? t("stateUp")
                        : s.status_code != null
                          ? String(s.status_code)
                          : t("stateDown")}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                    {s.latency_ms != null ? `${s.latency_ms}ms` : "—"}
                  </p>
                  {s.error ? (
                    <div className="mt-1 space-y-0.5">
                      <p className="break-all text-xs text-destructive">
                        {s.error}
                      </p>
                      {explainUptimeError(s.error) ? (
                        <p className="text-xs text-muted-foreground">
                          {t(explainUptimeError(s.error) as string)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div
              className="hidden overflow-x-auto md:block"
              data-testid="uptime-history-desktop"
            >
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
                      {formatSampleTime(s.checked_at)}
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
