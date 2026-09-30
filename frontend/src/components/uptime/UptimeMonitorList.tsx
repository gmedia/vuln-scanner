import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Activity } from "lucide-react";
import type { UptimeMonitor } from "@/api/uptime";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { Sparkline } from "@/components/uptime/Sparkline";
import { MonitorActionsMenu } from "@/components/uptime/MonitorActionsMenu";
import { explainUptimeError } from "@/components/uptime/uptimeErrors";
import { LiveDot, ProtocolGlyph } from "@/components/uptime/UptimeChrome";
import {
  stateBadgeVariant,
  stateRailClass,
} from "@/components/uptime/uptimeChrome";
import { cn } from "@/lib/utils";

function rowAccentClass(state: string): string {
  if (state === "down") return "border-l-2 border-l-destructive";
  if (state === "degraded") return "border-l-2 border-l-amber-500";
  if (state === "up") return "border-l-2 border-l-primary/50";
  return "border-l-2 border-l-muted-foreground/30";
}

export function UptimeMonitorList({
  monitors,
  onHistory,
  onEdit,
  onPause,
  onDelete,
  stateLabel,
}: {
  readonly monitors: readonly UptimeMonitor[];
  readonly onHistory: (id: string) => void;
  readonly onEdit: (m: UptimeMonitor) => void;
  readonly onPause: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly stateLabel: (state: string) => string;
}) {
  const { t } = useTranslation("uptime");
  if (monitors.length === 0) {
    return (
      <div className="m-4 flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-8 text-center">
        <Activity className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-foreground">{t("filterEmpty")}</p>
      </div>
    );
  }
  return (
    <>
      <div className="space-y-2 p-3 md:hidden">
        {monitors.map((m) => (
          <div
            key={m.id}
            className={cn(
              "relative rounded-lg border border-border bg-card p-3 text-left",
              m.state === "down" && "bg-destructive/[0.04]",
            )}
          >
            <span
              className={cn(
                "absolute inset-y-2 left-0 w-0.5 rounded-full",
                stateRailClass(m.state),
              )}
              aria-hidden
            />
            <div className="flex items-start justify-between gap-2 pl-3">
              <Link
                to={`/uptime/${m.id}`}
                className="min-w-0 break-all font-medium text-foreground hover:underline"
                data-testid="uptime-open"
              >
                <span className="inline-flex items-center gap-2">
                  {m.state === "up" && m.enabled ? <LiveDot /> : null}
                  {m.name}
                </span>
              </Link>
              <Badge variant={stateBadgeVariant(m.state)}>
                {stateLabel(m.state)}
              </Badge>
            </div>
            <p className="mt-1 flex items-center gap-1.5 break-all pl-3 font-mono text-xs text-muted-foreground">
              <ProtocolGlyph type={m.check_type} />
              {m.check_type} · {m.target}
            </p>
            <p className="mt-1 pl-3 font-mono text-xs tabular-nums text-muted-foreground">
              {m.uptime_24h != null ? `${m.uptime_24h}%` : "—"}
              {m.last_latency_ms != null ? ` · ${m.last_latency_ms}ms` : ""}
            </p>
            <div className="mt-2 flex justify-end">
              <MonitorActionsMenu
                monitor={m}
                historyTestId="uptime-history-mobile"
                onHistory={() => onHistory(m.id)}
                onEdit={() => onEdit(m)}
                onPause={() => onPause(m.id)}
                onDelete={() => onDelete(m.id)}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[18%] text-[10px] uppercase tracking-wider">
                {t("colName")}
              </TableHead>
              <TableHead className="w-[12%] text-[10px] uppercase tracking-wider">
                {t("colStatus")}
              </TableHead>
              <TableHead className="w-[28%] text-[10px] uppercase tracking-wider">
                {t("colTarget")}
              </TableHead>
              <TableHead className="w-[10%] text-right text-[10px] uppercase tracking-wider">
                {t("colUptime")}
              </TableHead>
              <TableHead className="w-[10%] text-right text-[10px] uppercase tracking-wider">
                {t("latency")}
              </TableHead>
              <TableHead className="w-[12%] text-[10px] uppercase tracking-wider">
                {t("colSpark")}
              </TableHead>
              <TableHead className="w-[10%] text-right text-[10px] uppercase tracking-wider">
                {t("colActions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monitors.map((m) => (
              <TableRow
                key={m.id}
                data-testid="uptime-row"
                className={cn(
                  "h-12 hover:bg-muted/50",
                  rowAccentClass(m.state),
                  m.state === "down" && "bg-destructive/[0.04]",
                )}
              >
                <TableCell className="font-medium">
                  <Link
                    to={`/uptime/${m.id}`}
                    className="inline-flex items-center gap-2 hover:underline"
                    data-testid="uptime-open"
                  >
                    {m.state === "up" && m.enabled ? <LiveDot /> : null}
                    <span className="truncate">{m.name}</span>
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={stateBadgeVariant(m.state)}>
                    {stateLabel(m.state)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <p className="flex items-center gap-1.5 font-mono text-sm text-foreground">
                    <ProtocolGlyph type={m.check_type} />
                    <span className="truncate">
                      {m.check_type} · {m.target}
                    </span>
                  </p>
                  {m.last_error ? (
                    <div className="mt-1 max-w-md space-y-1">
                      <p className="truncate text-xs text-destructive">
                        <span className="text-muted-foreground">
                          {t("lastError")}:{" "}
                        </span>
                        {m.last_error}
                      </p>
                      {explainUptimeError(m.last_error) ? (
                        <p className="text-xs text-muted-foreground">
                          {t(explainUptimeError(m.last_error) as string)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {m.uptime_24h != null ? `${m.uptime_24h}%` : "—"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {m.last_latency_ms != null ? `${m.last_latency_ms}ms` : "—"}
                </TableCell>
                <TableCell>
                  <Sparkline monitorId={m.id} state={m.state} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end">
                    <MonitorActionsMenu
                      monitor={m}
                      historyTestId="uptime-history"
                      onHistory={() => onHistory(m.id)}
                      onEdit={() => onEdit(m)}
                      onPause={() => onPause(m.id)}
                      onDelete={() => onDelete(m.id)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export function UptimeMonitorListCard({
  monitors,
  onHistory,
  onEdit,
  onPause,
  onDelete,
  stateLabel,
  totalCount,
}: {
  readonly monitors: readonly UptimeMonitor[];
  readonly onHistory: (id: string) => void;
  readonly onEdit: (m: UptimeMonitor) => void;
  readonly onPause: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly stateLabel: (state: string) => string;
  readonly totalCount?: number;
}) {
  const { t } = useTranslation("uptime");
  const shown = monitors.length;
  const total = totalCount ?? shown;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border pb-4">
        <CardTitle className="text-sm tracking-wide">{t("tableTitle")}</CardTitle>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          {t("filterShowing", { shown, total })}
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <UptimeMonitorList
          monitors={monitors}
          onHistory={onHistory}
          onEdit={onEdit}
          onPause={onPause}
          onDelete={onDelete}
          stateLabel={stateLabel}
        />
      </CardContent>
    </Card>
  );
}
