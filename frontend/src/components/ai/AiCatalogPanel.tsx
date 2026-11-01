import { Library } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AiPublicModel } from "@/api/ai";
import { formatIdr, formatUsdPer1m } from "@/components/admin/aiFormat";
import { EmptyState } from "@/components/patterns/EmptyState";
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
  const primaryPrice = (usd: number | null, idr: number): string =>
    usd == null ? formatIdr(idr) : formatUsdPer1m(usd);
  const secondaryPrice = (usd: number | null, idr: number): string | null =>
    usd == null ? null : formatIdr(idr);
  return (
    <Card data-testid="ai-catalog-card">
      <CardHeader className="gap-1">
        <CardDescription>{t("catalogHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <TableRowSkeleton rows={5} columns={4} />
        ) : models.length === 0 ? (
          <EmptyState
            icon={Library}
            title={t("catalogEmpty")}
            hint={t("catalogEmptyHint")}
          />
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
                        {primaryPrice(
                          m.price_usd_per_1m_in,
                          m.price_idr_per_1k_in,
                        )}
                      </p>
                      {secondaryPrice(
                        m.price_usd_per_1m_in,
                        m.price_idr_per_1k_in,
                      ) ? (
                        <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                          {secondaryPrice(
                            m.price_usd_per_1m_in,
                            m.price_idr_per_1k_in,
                          )}
                        </p>
                      ) : null}
                    </div>
                    <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {t("colOut")}
                      </p>
                      <p className="mt-0.5 font-mono text-xs tabular-nums text-foreground">
                        {primaryPrice(
                          m.price_usd_per_1m_out,
                          m.price_idr_per_1k_out,
                        )}
                      </p>
                      {secondaryPrice(
                        m.price_usd_per_1m_out,
                        m.price_idr_per_1k_out,
                      ) ? (
                        <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                          {secondaryPrice(
                            m.price_usd_per_1m_out,
                            m.price_idr_per_1k_out,
                          )}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {m.fx_stale ? (
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      {t("fxStaleNote")}
                    </p>
                  ) : null}
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
                        {m.fx_stale ? (
                          <p className="mt-0.5 font-normal text-[10px] text-muted-foreground">
                            {t("fxStaleNote")}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatCount(m.max_ctx)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        <span className="block">
                          {primaryPrice(
                            m.price_usd_per_1m_in,
                            m.price_idr_per_1k_in,
                          )}
                        </span>
                        {secondaryPrice(
                          m.price_usd_per_1m_in,
                          m.price_idr_per_1k_in,
                        ) ? (
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">
                            {secondaryPrice(
                              m.price_usd_per_1m_in,
                              m.price_idr_per_1k_in,
                            )}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        <span className="block">
                          {primaryPrice(
                            m.price_usd_per_1m_out,
                            m.price_idr_per_1k_out,
                          )}
                        </span>
                        {secondaryPrice(
                          m.price_usd_per_1m_out,
                          m.price_idr_per_1k_out,
                        ) ? (
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">
                            {secondaryPrice(
                              m.price_usd_per_1m_out,
                              m.price_idr_per_1k_out,
                            )}
                          </span>
                        ) : null}
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
