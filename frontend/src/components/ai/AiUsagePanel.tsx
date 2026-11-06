import { ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AiUsage } from "@/api/ai";
import {
  formatAiTime,
  formatIdr,
  formatLatencyMs,
  formatTps,
} from "@/components/admin/aiFormat";
import { EmptyState } from "@/components/patterns/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/Card";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";

function sourceLabel(source: string, t: (key: string) => string): string {
  if (source === "admin_trial" || source === "customer_trial") {
    return t("sourceTrial");
  }
  return t("sourceSdk");
}

export function AiUsagePanel({
  items,
  onSeeCatalog,
  loading = false,
}: {
  readonly items: readonly AiUsage[];
  readonly onSeeCatalog: () => void;
  readonly loading?: boolean;
}) {
  const { t, i18n } = useTranslation("ai");
  return (
    <Card data-testid="ai-usage-card">
      <CardHeader className="gap-1">
        <CardDescription>{t("usageHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <TableRowSkeleton rows={5} columns={9} />
        ) : items.length === 0 ? (
          <EmptyState
            testId="ai-usage-empty"
            icon={ScrollText}
            title={t("usageEmpty")}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={onSeeCatalog}
              >
                {t("usageEmptyHint")}
              </Button>
            }
          />
        ) : (
          <>
            <div className="space-y-2 md:hidden" data-testid="ai-usage-list-mobile">
              {items.map((u) => (
                <div
                  key={u.id}
                  className="rounded-lg border border-border bg-card p-3"
                  data-testid={`ai-usage-card-${u.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-all text-sm font-medium text-foreground">
                      {u.model_public_id}
                    </p>
                    <Badge variant="default">{sourceLabel(u.source, t)}</Badge>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs tabular-nums text-muted-foreground">
                    <div>
                      <dt className="inline">{t("colStatus")}: </dt>
                      <dd className="inline text-foreground">
                        {u.http_status ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">{t("colTokenIn")}: </dt>
                      <dd className="inline text-foreground">
                        {u.prompt_tokens}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">{t("colTokenOut")}: </dt>
                      <dd className="inline text-foreground">
                        {u.completion_tokens}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">{t("colCache")}: </dt>
                      <dd className="inline text-foreground">
                        {u.cached_tokens}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">{t("colTtft")}: </dt>
                      <dd className="inline text-foreground">
                        {formatLatencyMs(u.ttft_ms)}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">{t("colTps")}: </dt>
                      <dd className="inline text-foreground">
                        {formatTps(u.tps)}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2 font-mono text-xs tabular-nums text-muted-foreground">
                    {formatIdr(u.billed_idr)} ·{" "}
                    {formatAiTime(u.created_at, i18n.language)}
                  </p>
                </div>
              ))}
            </div>
            <div
              className="hidden overflow-x-auto md:block"
              data-testid="ai-usage-list-desktop"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] uppercase tracking-wider">
                      {t("colModel")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">
                      {t("colStatus")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">
                      {t("colTokenIn")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">
                      {t("colTokenOut")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">
                      {t("colCache")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">
                      {t("colTtft")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">
                      {t("colTps")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">
                      {t("colBilled")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">
                      {t("colTime")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="break-all">
                        <span className="font-medium">{u.model_public_id}</span>
                        <span className="ml-2 align-middle">
                          <Badge variant="default">{sourceLabel(u.source, t)}</Badge>
                        </span>
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">
                        {u.http_status ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">
                        {u.prompt_tokens}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">
                        {u.completion_tokens}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">
                        {u.cached_tokens}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">
                        {formatLatencyMs(u.ttft_ms)}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">
                        {formatTps(u.tps)}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">
                        {formatIdr(u.billed_idr)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatAiTime(u.created_at, i18n.language)}
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
