import { ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AiUsage } from "@/api/ai";
import { formatIdr } from "@/components/admin/aiFormat";
import { aiSparseCardClass } from "@/components/ai/aiLayout";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";

export function AiUsagePanel({
  items,
  onSeeCatalog,
}: {
  readonly items: readonly AiUsage[];
  readonly onSeeCatalog: () => void;
}) {
  const { t } = useTranslation("ai");
  return (
    <Card className={aiSparseCardClass(items.length)} data-testid="ai-usage-card">
      <CardHeader>
        <CardTitle>{t("tabUsage")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <div
            className="flex min-h-[8rem] flex-col items-center justify-center gap-2 px-6 py-8 text-center"
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
                  <p className="min-w-0 break-all text-sm font-medium text-foreground">
                    {u.model_public_id}
                  </p>
                  <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                    {u.prompt_tokens}/{u.completion_tokens} · {formatIdr(u.billed_idr)}
                  </p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {u.created_at}
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
                    <TableHead>{t("colModel")}</TableHead>
                    <TableHead>{t("colTokens")}</TableHead>
                    <TableHead>{t("colBilled")}</TableHead>
                    <TableHead>{t("colTime")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="break-all">{u.model_public_id}</TableCell>
                      <TableCell className="font-mono tabular-nums">
                        {u.prompt_tokens}/{u.completion_tokens}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatIdr(u.billed_idr)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.created_at}
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
