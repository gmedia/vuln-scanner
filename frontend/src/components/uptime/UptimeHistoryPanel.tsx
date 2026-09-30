import { useTranslation } from "react-i18next";
import { Activity } from "lucide-react";
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
import { cn } from "@/lib/utils";

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
  emptyHint,
}: {
  readonly monitor: UptimeMonitor;
  readonly rows: readonly UptimeSample[];
  readonly loading: boolean;
  readonly emptyHint?: string;
}) {
  const { t } = useTranslation("uptime");
  return (
    <Card data-testid="uptime-history-panel" className="overflow-hidden">
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="text-sm tracking-wide">
          {t("historyTitle", { name: monitor.name })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        <p className="text-xs text-muted-foreground">{t("probeRule")}</p>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <div className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-8 text-center">
            <Activity className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              {emptyHint ?? t("historyEmpty")}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2 md:hidden" data-testid="uptime-history-mobile">
              {rows.map((s) => (
                <div
                  key={s.id}
                  data-testid="uptime-history-row"
                  className={cn(
                    "rounded-md border border-border p-3",
                    !s.ok && "bg-destructive/[0.04]",
                  )}
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
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    {t("colTime")}
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    {t("colStatus")}
                  </TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider">
                    {t("latency")}
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    {t("lastError")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow
                    key={s.id}
                    data-testid="uptime-history-row"
                    className={cn(
                      "h-12 hover:bg-muted/50",
                      !s.ok && "bg-destructive/[0.04]",
                    )}
                  >
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
