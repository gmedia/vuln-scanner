import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calculator, Loader2, Check, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { adminApi, type HppRateItem } from "@/api/admin";
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
  const [overheadEdit, setOverheadEdit] = useState<number | null>(null);
  const [savingOverhead, setSavingOverhead] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [costDate, setCostDate] = useState("");
  const [costAmount, setCostAmount] = useState("");
  const [costCategory, setCostCategory] = useState<"opex" | "variable">("opex");
  const [costNote, setCostNote] = useState("");

  const { data: rates, isLoading: ratesLoading } = useQuery({
    queryKey: ["admin-hpp"],
    queryFn: adminApi.getHppRates,
  });

  const { data: overhead, isLoading: overheadLoading } = useQuery({
    queryKey: ["admin-hpp-overhead"],
    queryFn: adminApi.getHppOverhead,
  });

  const reportParams =
    dateFrom || dateTo
      ? { from: dateFrom || undefined, to: dateTo || undefined }
      : undefined;

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ["admin-hpp-report", dateFrom, dateTo],
    queryFn: () => adminApi.getHppReport(reportParams),
  });

  const { data: costLines, isLoading: costsLoading } = useQuery({
    queryKey: ["admin-hpp-costs", dateFrom, dateTo],
    queryFn: () => adminApi.listHppCosts(reportParams),
  });

  const updateOverhead = useMutation({
    mutationFn: (amountIdr: number) =>
      adminApi.updateHppOverhead({ amount_idr: amountIdr }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-hpp-overhead"] });
      queryClient.invalidateQueries({ queryKey: ["admin-hpp-report"] });
      setSavingOverhead(false);
    },
    onError: () => {
      setSavingOverhead(false);
    },
  });

  const createCost = useMutation({
    mutationFn: () =>
      adminApi.createHppCost({
        incurred_on: costDate,
        amount_idr: parseInt(costAmount, 10) || 0,
        category: costCategory,
        note: costNote,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-hpp-costs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-hpp-report"] });
      setCostAmount("");
      setCostNote("");
    },
  });

  const deleteCost = useMutation({
    mutationFn: (id: string) => adminApi.deleteHppCost(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-hpp-costs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-hpp-report"] });
    },
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
          <p className="text-[11px] text-muted-foreground">
            {t("hppSubtitle")}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">
            {t("hppRatesCard")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ratesLoading ? (
            <TableRowSkeleton rows={5} />
          ) : !rates?.length ? (
            <p className="text-sm text-muted-foreground">
              {t("hppRatesEmpty")}
            </p>
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
                        <Badge
                          variant="default"
                          className="text-[10px] uppercase"
                        >
                          {item.key}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          aria-label={item.key}
                          value={edited[item.key] ?? item.amount_idr}
                          onChange={(e) =>
                            handleChange(item.key, e.target.value)
                          }
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
                            <span className="text-muted-foreground">
                              {t("saved")}
                            </span>
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

      <Card data-testid="hpp-overhead-card">
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">
            {t("hppOverheadCard")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            {t("hppOverheadHint")}
          </p>
          {overheadLoading ? (
            <TableRowSkeleton rows={1} />
          ) : (
            <div className="flex min-w-0 flex-col gap-1.5 sm:max-w-xs">
              <Label htmlFor="hpp-overhead-amount">
                {t("hppOverheadAmount")}
              </Label>
              <Input
                id="hpp-overhead-amount"
                type="number"
                min={0}
                aria-label={t("hppOverheadAmount")}
                value={overheadEdit ?? overhead?.amount_idr ?? 0}
                onChange={(e) =>
                  setOverheadEdit(parseInt(e.target.value, 10) || 0)
                }
                className="h-10 min-h-10 font-mono text-xs tabular-nums"
              />
              <Button
                variant="outline"
                size="sm"
                className="w-fit text-xs"
                disabled={
                  savingOverhead ||
                  overheadEdit === null ||
                  overheadEdit === (overhead?.amount_idr ?? 0)
                }
                onClick={() => {
                  if (overheadEdit === null) return;
                  setSavingOverhead(true);
                  updateOverhead.mutate(overheadEdit);
                }}
              >
                {savingOverhead ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  t("save")
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="hpp-costs-card">
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">
            {t("hppCostsCard")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-[11px] text-muted-foreground">
            {t("hppCostsHint")}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="hpp-cost-date">{t("hppCostDate")}</Label>
              <DatePicker
                id="hpp-cost-date"
                value={costDate}
                onChange={setCostDate}
                placeholder={t("hppCostDate")}
                aria-label={t("hppCostDate")}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="hpp-cost-amount">{t("hppCostAmount")}</Label>
              <Input
                id="hpp-cost-amount"
                type="number"
                min={0}
                value={costAmount}
                onChange={(e) => setCostAmount(e.target.value)}
                className="h-10 min-h-10 font-mono text-xs tabular-nums"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="hpp-cost-category">{t("hppCostCategory")}</Label>
              <Select
                value={costCategory}
                onValueChange={(v) => setCostCategory(v as "opex" | "variable")}
              >
                <SelectTrigger id="hpp-cost-category" className="h-10 min-h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="opex">{t("hppCostOpex")}</SelectItem>
                  <SelectItem value="variable">
                    {t("hppCostVariable")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="hpp-cost-note">{t("hppCostNote")}</Label>
              <Input
                id="hpp-cost-note"
                value={costNote}
                onChange={(e) => setCostNote(e.target.value)}
                className="h-10 min-h-10"
                maxLength={200}
              />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-fit text-xs"
            disabled={!costDate || createCost.isPending}
            onClick={() => createCost.mutate()}
          >
            {createCost.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              t("hppCostAdd")
            )}
          </Button>
          {costsLoading ? (
            <TableRowSkeleton rows={2} />
          ) : !costLines?.length ? (
            <p className="text-sm text-muted-foreground">
              {t("hppCostsEmpty")}
            </p>
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    {t("hppCostDate")}
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    {t("hppCostCategory")}
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    {t("hppColAmount")}
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    {t("hppCostNote")}
                  </TableHead>
                  <TableHead className="w-[4rem]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {costLines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {new Date(line.incurred_on).toLocaleDateString(locale)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="default"
                        className="text-[10px] uppercase"
                      >
                        {line.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {formatIdr(line.amount_idr)}
                    </TableCell>
                    <TableCell className="truncate text-xs text-muted-foreground">
                      {line.note || "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t("hppCostDelete")}
                        onClick={() => deleteCost.mutate(line.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
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
          <CardTitle className="text-sm tracking-wide">
            {t("hppReportCard")}
          </CardTitle>
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
                IDR · {t("hppFullyTotal")}:{" "}
                <span className="font-mono tabular-nums text-foreground">
                  {formatIdr(report?.total_fully_loaded_hpp_idr ?? 0)}
                </span>{" "}
                IDR · {report?.total_count ?? 0} {t("hppUnits")}
              </p>
              {(report?.unallocated_overhead_idr ?? 0) > 0 ? (
                <p className="mb-3 text-xs text-muted-foreground">
                  {t("hppUnallocated")}:{" "}
                  <span className="font-mono tabular-nums">
                    {formatIdr(report?.unallocated_overhead_idr)}
                  </span>
                </p>
              ) : null}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] uppercase">
                      {t("hppColKey")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase">
                      {t("hppColCount")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase">
                      {t("hppColAmount")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase">
                      {t("hppColHpp")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase">
                      {t("hppColOverheadShare")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase">
                      {t("hppColFullyLoaded")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase">
                      {t("hppColFullyUnit")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report?.lines.map((line) => (
                    <TableRow key={line.key}>
                      <TableCell>
                        <Badge
                          variant="default"
                          className="text-[10px] uppercase"
                        >
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
                      <TableCell className="font-mono text-xs tabular-nums">
                        {formatIdr(line.overhead_share_idr)}
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {formatIdr(line.fully_loaded_hpp_idr)}
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {formatIdr(line.fully_loaded_unit_idr)}
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
        <h3 className="mb-2 text-sm font-semibold tracking-wide">
          {t("hppSkuTitle")}
        </h3>
        <p className="mb-3 text-[11px] text-muted-foreground">
          {t("hppSkuHint")}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {report?.sku_estimates.map((sku) => (
            <Card key={sku.sku} data-testid={`hpp-sku-${sku.sku}`}>
              <CardHeader>
                <CardTitle className="text-sm uppercase">{sku.sku}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                <p>
                  {t("hppListPrice")}:{" "}
                  <span className="font-mono tabular-nums">
                    {formatIdr(sku.list_idr)}
                  </span>
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
                <Badge variant="info" className="text-[10px]">
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
