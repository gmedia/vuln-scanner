import { ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AiUsage } from "@/api/ai";
import { formatAiTime, formatIdr } from "@/components/admin/aiFormat";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";

function sourceLabel(source: string, t: (key: string) => string): string {
  if (source === "admin_trial") return t("sourceTrial");
  return t("sourceSdk");
}

export function AiUsagePanel({
  items,
  onSeeCatalog,
}: {
  readonly items: readonly AiUsage[];
  readonly onSeeCatalog: () => void;
}) {
  const { t, i18n } = useTranslation("ai");
  return (
    <Card data-testid="ai-usage-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base tracking-tight">{t("tabUsage")}</CardTitle>
          <CardDescription>{t("usageHint")}</CardDescription>
        </div>
        {items.length > 0 ? (
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
            {items.length}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <div
            className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-8 text-center"
            data-testid="ai-usage-empty"
          >
            <ScrollText className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-foreground">{t("usageEmpty")}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={onSeeCatalog}
            >
              {t("usageEmptyHint")}
            </Button>
          </div>
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
                  <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                    {u.prompt_tokens}/{u.completion_tokens} · {formatIdr(u.billed_idr)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
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
                      {t("colTokens")}
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
                        {u.prompt_tokens}/{u.completion_tokens}
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
