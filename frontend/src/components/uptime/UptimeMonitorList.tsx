import { useTranslation } from "react-i18next";
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

function stateBadgeVariant(state: string) {
  if (state === "up") return "completed" as const;
  if (state === "down") return "critical" as const;
  return "info" as const;
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
      <p className="px-6 py-8 text-center text-sm text-muted-foreground">
        {t("filterEmpty")}
      </p>
    );
  }
  return (
    <>
      <div className="space-y-2 p-3 md:hidden">
        {monitors.map((m) => (
          <div
            key={m.id}
            className="rounded-lg border border-border bg-card p-3 text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 break-all font-medium text-foreground">
                {m.name}
              </p>
              <Badge variant={stateBadgeVariant(m.state)}>
                {stateLabel(m.state)}
              </Badge>
            </div>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {m.check_type} · {m.target}
            </p>
            <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
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
              <TableHead className="w-[18%]">{t("colName")}</TableHead>
              <TableHead className="w-[12%]">{t("colStatus")}</TableHead>
              <TableHead className="w-[28%]">{t("colTarget")}</TableHead>
              <TableHead className="w-[10%] text-right">{t("colUptime")}</TableHead>
              <TableHead className="w-[10%] text-right">{t("latency")}</TableHead>
              <TableHead className="w-[12%]">{t("colSpark")}</TableHead>
              <TableHead className="w-[10%] text-right">{t("colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monitors.map((m) => (
              <TableRow
                key={m.id}
                data-testid="uptime-row"
                className={
                  m.state === "down"
                    ? "border-l-2 border-l-destructive"
                    : undefined
                }
              >
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell>
                  <Badge variant={stateBadgeVariant(m.state)}>
                    {stateLabel(m.state)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <p className="font-mono text-sm text-foreground">
                    {m.check_type} · {m.target}
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
}: {
  readonly monitors: readonly UptimeMonitor[];
  readonly onHistory: (id: string) => void;
  readonly onEdit: (m: UptimeMonitor) => void;
  readonly onPause: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly stateLabel: (state: string) => string;
}) {
  const { t } = useTranslation("uptime");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm tracking-wide">{t("tableTitle")}</CardTitle>
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
