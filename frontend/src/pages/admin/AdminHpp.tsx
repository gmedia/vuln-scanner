import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calculator, Loader2, Check } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  adminApi,
  type HppRateItem,
} from "@/api/admin";
import { useTranslation } from "react-i18next";
import { htmlLang, isAppLocale } from "@/i18n/locales";
import i18n from "@/i18n";

function formatIdr(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("id-ID");
}

function AdminHpp() {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const [edited, setEdited] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: rates, isLoading: ratesLoading } = useQuery({
    queryKey: ["admin-hpp"],
    queryFn: adminApi.getHppRates,
  });

  const reportParams =
    dateFrom || dateTo
      ? { from: dateFrom || undefined, to: dateTo || undefined }
      : undefined;

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ["admin-hpp-report", dateFrom, dateTo],
    queryFn: () => adminApi.getHppReport(reportParams),
  });

  const updateRate = useMutation({
    mutationFn: ({ key, amountIdr }: { key: string; amountIdr: number }) =>
      adminApi.updateHppRate(key, { amount_idr: amountIdr }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-hpp"] });
      queryClient.invalidateQueries({ queryKey: ["admin-hpp-report"] });
      setSaving(null);
    },
    onError: () => {
      setSaving(null);
    },
  });

  const handleChange = (key: string, value: string) => {
    const numValue = parseInt(value, 10) || 0;
    setEdited((prev) => ({ ...prev, [key]: numValue }));
  };

  const handleSave = (item: HppRateItem) => {
    const next = edited[item.key] ?? item.amount_idr;
    if (next === item.amount_idr) return;
    setSaving(item.key);
    updateRate.mutate({ key: item.key, amountIdr: next });
  };

  const hasChanges = (item: HppRateItem) => {
    const v = edited[item.key];
    return v !== undefined && v !== item.amount_idr;
  };

  const locale = isAppLocale(i18n.language)
    ? htmlLang(i18n.language) === "en"
      ? "en-US"
      : "id-ID"
    : "id-ID";

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-3">
        <Calculator className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-lg font-bold tracking-wide text-foreground">
            {t("hppTitle")}
          </h2>
          <p className="text-[11px] text-muted-foreground">{t("hppSubtitle")}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">{t("hppRatesCard")}</CardTitle>
        </CardHeader>
        <CardContent>
          {ratesLoading ? (
            <TableRowSkeleton rows={5} />
          ) : !rates?.length ? (
            <p className="text-sm text-muted-foreground">{t("hppRatesEmpty")}</p>
          ) : (
            <div className="hidden md:block">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[28%] text-[10px] uppercase tracking-wider">
                      {t("hppColKey")}
                    </TableHead>
                    <TableHead className="w-[32%] text-[10px] uppercase tracking-wider">
                      {t("hppColAmount")}
                    </TableHead>
                    <TableHead className="w-[20%] text-[10px] uppercase tracking-wider">
                      {t("colUpdated")}
                    </TableHead>
                    <TableHead className="w-[20%] text-right text-[10px] uppercase tracking-wider">
                      {t("colActions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rates.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell>
                        <Badge variant="default" className="text-[10px] uppercase">
                          {item.key}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          aria-label={item.key}
                          value={edited[item.key] ?? item.amount_idr}
                          onChange={(e) => handleChange(item.key, e.target.value)}
                          className="h-8 w-full max-w-[10rem] font-mono text-xs tabular-nums"
                        />
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {new Date(item.updated_at).toLocaleDateString(locale)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSave(item)}
                          disabled={!hasChanges(item) || saving === item.key}
                          className="text-xs"
                        >
                          {saving === item.key ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : hasChanges(item) ? (
                            <>
                              <Check className="mr-1 h-3 w-3" />
                              {t("save")}
                            </>
                          ) : (
                            <span className="text-muted-foreground">{t("saved")}</span>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {rates && rates.length > 0 ? (
            <div className="space-y-3 md:hidden">
              {rates.map((item) => (
                <div
                  key={item.key}
                  className="space-y-2 rounded-lg border border-border bg-card p-3"
                >
                  <Badge variant="default" className="text-[10px] uppercase">
                    {item.key}
                  </Badge>
                  <Input
                    type="number"
                    min={0}
                    aria-label={item.key}
                    value={edited[item.key] ?? item.amount_idr}
                    onChange={(e) => handleChange(item.key, e.target.value)}
                    className="h-11 w-full font-mono text-xs tabular-nums"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSave(item)}
                    disabled={!hasChanges(item) || saving === item.key}
                    className="min-h-11 w-full text-xs"
                  >
                    {t("save")}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div
        data-testid="hpp-report-filters"
        className="grid grid-cols-1 gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-2"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="hpp-date-from">{t("hppFrom")}</Label>
          <DatePicker
            id="hpp-date-from"
            value={dateFrom}
            onChange={setDateFrom}
            placeholder={t("hppFrom")}
            aria-label={t("hppFrom")}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="hpp-date-to">{t("hppTo")}</Label>
          <DatePicker
            id="hpp-date-to"
            value={dateTo}
            onChange={setDateTo}
            placeholder={t("hppTo")}
            aria-label={t("hppTo")}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">{t("hppReportCard")}</CardTitle>
        </CardHeader>
        <CardContent>
          {reportLoading ? (
            <TableRowSkeleton rows={5} />
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                {t("hppTotal")}:{" "}
                <span className="font-mono tabular-nums text-foreground">
                  {formatIdr(report?.total_hpp_idr ?? 0)}
                </span>{" "}
                IDR · {report?.total_count ?? 0} {t("hppUnits")}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] uppercase">{t("hppColKey")}</TableHead>
                    <TableHead className="text-[10px] uppercase">{t("hppColCount")}</TableHead>
                    <TableHead className="text-[10px] uppercase">{t("hppColAmount")}</TableHead>
                    <TableHead className="text-[10px] uppercase">{t("hppColHpp")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report?.lines.map((line) => (
                    <TableRow key={line.key}>
                      <TableCell>
                        <Badge variant="default" className="text-[10px] uppercase">
                          {line.key}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {line.count}
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {formatIdr(line.rate_idr)}
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {formatIdr(line.hpp_idr)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <div>
        <h3 className="mb-2 text-sm font-semibold tracking-wide">{t("hppSkuTitle")}</h3>
        <p className="mb-3 text-[11px] text-muted-foreground">{t("hppSkuHint")}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {report?.sku_estimates.map((sku) => (
            <Card key={sku.sku} data-testid={`hpp-sku-${sku.sku}`}>
              <CardHeader>
                <CardTitle className="text-sm uppercase">{sku.sku}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                <p>
                  {t("hppListPrice")}:{" "}
                  <span className="font-mono tabular-nums">{formatIdr(sku.list_idr)}</span>
                </p>
                <p>
                  {t("hppIfAllIp")}:{" "}
                  <span className="font-mono tabular-nums">
                    {formatIdr(sku.hpp_if_all_ip_idr)}
                  </span>
                </p>
                <p>
                  {t("hppIfAllDomain")}:{" "}
                  <span className="font-mono tabular-nums">
                    {formatIdr(sku.hpp_if_all_domain_idr)}
                  </span>
                </p>
                <Badge variant="outline" className="text-[10px]">
                  {sku.label}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AdminHpp;
