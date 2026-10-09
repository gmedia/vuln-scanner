import { Library } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AiPublicModel } from "@/api/ai";
import { formatIdr } from "@/components/admin/aiFormat";
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

function formatCount(n: number): string {
  return n.toLocaleString("id-ID");
}

export function AiCatalogPanel({
  models,
  loading = false,
}: {
  readonly models: readonly AiPublicModel[];
  readonly loading?: boolean;
}) {
  const { t } = useTranslation("ai");
  return (
    <Card data-testid="ai-catalog-card">
      <CardHeader className="gap-1">
        <CardDescription>{t("catalogHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <TableRowSkeleton rows={5} columns={4} />
        ) : models.length === 0 ? (
          <div className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-8 text-center">
            <Library className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-foreground">{t("catalogEmpty")}</p>
            <p className="text-xs text-muted-foreground">{t("catalogEmptyHint")}</p>
          </div>
        ) : (
          <>
            <div
              className="space-y-2 md:hidden"
              data-testid="ai-catalog-list-mobile"
            >
              {models.map((m) => (
                <div
                  key={m.public_id}
                  className="rounded-lg border border-border bg-card p-3"
                  data-testid={`ai-catalog-card-${m.public_id}`}
                >
                  <p className="min-w-0 break-all text-sm font-medium text-foreground">
                    {m.public_id}
                  </p>
                  <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {t("ctxMeta", {
                      ctx: formatCount(m.max_ctx),
                      cap: formatCount(m.max_tokens_cap),
                    })}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {t("colIn")}
                      </p>
                      <p className="mt-0.5 font-mono text-xs tabular-nums text-foreground">
                        {formatIdr(m.price_idr_per_1k_in)}
                      </p>
                    </div>
                    <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {t("colOut")}
                      </p>
                      <p className="mt-0.5 font-mono text-xs tabular-nums text-foreground">
                        {formatIdr(m.price_idr_per_1k_out)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div
              className="hidden overflow-x-auto md:block"
              data-testid="ai-catalog-list-desktop"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] uppercase tracking-wider">
                      {t("colModel")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">
                      {t("colCtx")}
                    </TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider">
                      {t("colIn")}
                    </TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider">
                      {t("colOut")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models.map((m) => (
                    <TableRow key={m.public_id}>
                      <TableCell className="break-all font-medium">
                        {m.public_id}
                        <p className="mt-0.5 font-normal font-mono text-[11px] tabular-nums text-muted-foreground">
                          {t("ctxMeta", {
                            ctx: formatCount(m.max_ctx),
                            cap: formatCount(m.max_tokens_cap),
                          })}
                        </p>
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatCount(m.max_ctx)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatIdr(m.price_idr_per_1k_in)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatIdr(m.price_idr_per_1k_out)}
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
