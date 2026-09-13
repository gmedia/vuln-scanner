import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DollarSign } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import PageHeader from "@/components/layout/PageHeader";
import { adminApi } from "@/api/admin";
import { useTranslation } from "react-i18next";
import { htmlLang, isAppLocale } from "@/i18n/locales";
import i18n from "@/i18n";

function formatUpdatedAt(iso: string, language: string): string {
  return new Date(iso).toLocaleDateString(
    isAppLocale(language)
      ? htmlLang(language) === "en"
        ? "en-US"
        : "id-ID"
      : "id-ID",
  );
}

function AdminPricing() {
  const { t } = useTranslation("admin");

  const { data: pricing, isLoading } = useQuery({
    queryKey: ["admin-pricing"],
    queryFn: adminApi.getPricing,
  });

  return (
    <div className="w-full space-y-6">
      <PageHeader
        leading={<DollarSign className="h-6 w-6 shrink-0 text-primary" />}
        title={t("pricingTitle")}
      />

      <Alert data-testid="pricing-leftover-banner">
        <AlertTitle>{t("pricingLeftoverTitle")}</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{t("pricingLeftoverBody")}</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/hpp" data-testid="pricing-link-hpp">
              {t("linkHpp")}
            </Link>
          </Button>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">
            {t("pricingCard")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableRowSkeleton rows={4} />
          ) : pricing?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 rounded-full bg-muted p-3">
                <DollarSign className="h-6 w-6 text-muted-foreground opacity-40" />
              </div>
              <p className="text-sm text-foreground">{t("pricingEmpty")}</p>
            </div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {pricing?.map((item) => (
                  <div
                    key={item.id}
                    className="space-y-2 rounded-lg border border-border bg-card p-3"
                  >
                    <Badge variant="default" className="text-[10px] uppercase">
                      {item.scan_type}
                    </Badge>
                    <p className="font-mono text-sm tabular-nums">
                      {item.credit_cost}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {formatUpdatedAt(item.updated_at, i18n.language)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="hidden md:block">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[36%] text-[10px] uppercase tracking-wider">
                        {t("colScanType")}
                      </TableHead>
                      <TableHead className="w-[32%] text-[10px] uppercase tracking-wider">
                        {t("colCreditCost")}
                      </TableHead>
                      <TableHead className="w-[32%] text-[10px] uppercase tracking-wider">
                        {t("colUpdated")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pricing?.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Badge
                            variant="default"
                            className="text-[10px] uppercase"
                          >
                            {item.scan_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs tabular-nums">
                            {item.credit_cost}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs tabular-nums text-muted-foreground">
                            {formatUpdatedAt(item.updated_at, i18n.language)}
                          </span>
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
    </div>
  );
}

export default AdminPricing;
