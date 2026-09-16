import { useTranslation } from "react-i18next";
import type { AiPublicModel } from "@/api/ai";
import { formatIdr } from "@/components/admin/aiFormat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";

export function AiCatalogPanel({
  models,
}: {
  readonly models: readonly AiPublicModel[];
}) {
  const { t } = useTranslation("ai");
  return (
    <Card data-testid="ai-catalog-card">
      <CardHeader>
        <CardTitle>{t("tabCatalog")}</CardTitle>
      </CardHeader>
      <CardContent>
        {models.length === 0 ? (
          <div className="flex min-h-[8rem] items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">{t("catalogEmpty")}</p>
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
                  <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                    {t("colIn")}: {formatIdr(m.price_idr_per_1k_in)}
                  </p>
                  <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                    {t("colOut")}: {formatIdr(m.price_idr_per_1k_out)}
                  </p>
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
                    <TableHead>{t("colModel")}</TableHead>
                    <TableHead className="text-right">{t("colIn")}</TableHead>
                    <TableHead className="text-right">{t("colOut")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models.map((m) => (
                    <TableRow key={m.public_id}>
                      <TableCell className="break-all font-medium">
                        {m.public_id}
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
