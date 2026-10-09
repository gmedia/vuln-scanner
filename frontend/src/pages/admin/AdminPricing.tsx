import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import {
  AdminShell,
  AdminShellBody,
  AdminShellHead,
} from "@/components/admin/AdminShell";
import { SiemRail } from "@/components/siem/siemChrome";
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

      <AdminShell tone="warn" testid="pricing-leftover-banner">
        <AdminShellHead
          icon={TriangleAlert}
          title={t("pricingLeftoverTitle")}
        />
        <AdminShellBody className="space-y-3">
          <p className="max-w-prose text-xs text-muted-foreground">
            {t("pricingLeftoverBody")}
          </p>
          <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
            <Link to="/admin/hpp" data-testid="pricing-link-hpp">
              {t("linkHpp")}
            </Link>
          </Button>
        </AdminShellBody>
      </AdminShell>

      <AdminShell tone="primary" testid="admin-pricing-card">
        <AdminShellHead icon={DollarSign} title={t("pricingCard")} />
        <AdminShellBody>
          {isLoading ? (
            <TableRowSkeleton rows={4} columns={3} />
          ) : pricing?.length === 0 ? (
            <div
              className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-8 text-center"
              data-testid="admin-pricing-empty"
            >
              <DollarSign className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium text-foreground">
                {t("pricingEmpty")}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2 md:hidden">
                {pricing?.map((item) => (
                  <div
                    key={item.id}
                    className="relative space-y-2 overflow-hidden rounded-lg border border-border bg-card p-3 pl-4"
                  >
                    <SiemRail className="bg-primary" />
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
                <div className="overflow-hidden rounded-md border border-border">
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
                        <TableRow key={item.id} className="h-12 hover:bg-muted/50">
                          <TableCell className="relative pl-4">
                            <SiemRail className="bg-primary" />
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
              </div>
            </>
          )}
        </AdminShellBody>
      </AdminShell>
    </div>
  );
}

export default AdminPricing;
