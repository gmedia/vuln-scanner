import { useTranslation } from "react-i18next";
import type { AiPublicModel } from "@/api/ai";
import { formatIdr } from "@/components/admin/aiFormat";
import { aiItemGridClass, aiSparseCardClass } from "@/components/ai/aiLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

export function AiCatalogPanel({
  models,
}: {
  readonly models: readonly AiPublicModel[];
}) {
  const { t } = useTranslation("ai");
  return (
    <Card
      className={aiSparseCardClass(models.length)}
      data-testid="ai-catalog-card"
    >
      <CardHeader>
        <CardTitle>{t("tabCatalog")}</CardTitle>
      </CardHeader>
      <CardContent>
        {models.length === 0 ? (
          <div className="flex min-h-[8rem] items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">{t("catalogEmpty")}</p>
          </div>
        ) : (
          <div
            className={aiItemGridClass(models.length)}
            data-testid="ai-catalog-grid"
          >
            {models.map((m) => (
              <Card key={m.public_id}>
                <CardContent className="p-4">
                  <div className="mb-2 break-all font-medium">{m.public_id}</div>
                  <div className="text-sm text-muted-foreground">
                    {t("colIn")}: {formatIdr(m.price_idr_per_1k_in)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t("colOut")}: {formatIdr(m.price_idr_per_1k_out)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
