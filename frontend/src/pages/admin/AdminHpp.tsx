import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calculator, Loader2, Check, Trash2, Receipt } from "lucide-react";
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
  AdminShell,
  AdminShellBody,
  AdminShellHead,
} from "@/components/admin/AdminShell";
import { marginTone, reportTone } from "@/components/admin/adminChrome";
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
      <PageHeader
        leading={<Calculator className="h-6 w-6 shrink-0 text-primary" />}
        title={t("hppTitle")}
        description={t("hppSubtitle")}
      />

      <AdminShell tone="primary" testid="hpp-rates-card">
        <AdminShellHead
          icon={Calculator}
          title={t("hppRatesCard")}
          hint={t("hppRatesHint")}
        />
        <AdminShellBody>
          {ratesLoading ? (
            <TableRowSkeleton rows={5} columns={4} />
          ) : !rates?.length ? (
            <div
              className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-8 text-center"
              data-testid="hpp-rates-empty"
            >
              <Calculator className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium text-foreground">
                {t("hppRatesEmpty")}
              </p>
            </div>
          ) : (
            <div className="hidden md:block">
              <div className="overflow-hidden rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[28%] py-2 text-[10px] uppercase tracking-wider">
                        {t("hppColKey")}
                      </TableHead>
                      <TableHead className="w-[32%] py-2 text-[10px] uppercase tracking-wider">
                        {t("hppColAmount")}
                      </TableHead>
                      <TableHead className="w-[20%] py-2 text-[10px] uppercase tracking-wider">
                        {t("colUpdated")}
                      </TableHead>
                      <TableHead className="w-[20%] py-2 text-right text-[10px] uppercase tracking-wider">
                        {t("colActions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rates.map((item) => (
                      <TableRow key={item.key} className="hover:bg-muted/50">
                        <TableCell className="relative py-1.5 pl-4">
                          <SiemRail className="bg-primary" />
                          <Badge
                            variant="default"
                            className="text-[10px] uppercase"
                          >
                            {item.key}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5">
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
                        <TableCell className="py-1.5">
                          <span className="font-mono text-xs tabular-nums text-muted-foreground">
                            {new Date(item.updated_at).toLocaleDateString(locale)}
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5 text-right">
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
            </div>
          )}
          {rates && rates.length > 0 ? (
            <div className="space-y-2 md:hidden">
              {rates.map((item) => (
                <div
                  key={item.key}
                  className="relative space-y-2 overflow-hidden rounded-lg border border-border bg-card p-3 pl-4"
                >
                  <SiemRail className="bg-primary" />
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
        </AdminShellBody>
      </AdminShell>

      <AdminShell tone="warn" testid="hpp-overhead-card">
        <AdminShellHead
          icon={Receipt}
          title={t("hppOverheadCard")}
          hint={t("hppOverheadHint")}
        />
        <AdminShellBody className="space-y-3">
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
              <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {formatIdr(overheadEdit ?? overhead?.amount_idr ?? 0)} IDR
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-10 min-h-10 w-fit text-xs"
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
        </AdminShellBody>
      </AdminShell>

      <AdminShell tone="warn" testid="hpp-costs-card">
        <AdminShellHead
          icon={Receipt}
          title={t("hppCostsCard")}
          hint={t("hppCostsHint")}
        />
        <AdminShellBody className="space-y-4">
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
            className="h-10 min-h-10 w-fit text-xs"
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
            <TableRowSkeleton rows={2} columns={5} />
          ) : !costLines?.length ? (
            <div
              className="flex min-h-[6rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-6 text-center"
              data-testid="hpp-costs-empty"
            >
              <Receipt className="h-6 w-6 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">
                {t("hppCostsEmpty")}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
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
                    <TableRow key={line.id} className="h-12 hover:bg-muted/50">
                      <TableCell className="relative pl-4 font-mono text-xs tabular-nums">
                        <SiemRail className="bg-amber-500" />
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
                      <TableCell className="max-w-[20rem] whitespace-normal break-words text-xs text-muted-foreground">
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
            </div>
          )}
        </AdminShellBody>
      </AdminShell>

      <AdminShell tone="info" testid="hpp-report-filters">
        <AdminShellHead title={t("hppReportRange")} />
        <AdminShellBody>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        </AdminShellBody>
      </AdminShell>

      <div>
        <h3 className="mb-2 text-sm font-semibold tracking-wide">
          {t("hppSkuTitle")}
        </h3>
        <p className="mb-3 text-[11px] text-muted-foreground">
          {t("hppSkuHint")}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(report?.line_margins ?? []).map((row) => (
            <AdminShell
              key={row.line}
              tone={marginTone(row.margin_idr)}
              testid={`hpp-line-${row.line}`}
            >
              <AdminShellHead
                title={row.line === "host" ? t("hppLineHost") : t("hppLineScan")}
              />
              <AdminShellBody className="space-y-1 text-xs">
                <p>
                  {t("hppOrgCount")}:{" "}
                  <span className="font-mono tabular-nums">{row.org_count}</span>
                </p>
                <p>
                  {t("hppRevenue")}:{" "}
                  <span className="font-mono tabular-nums">
                    {formatIdr(row.revenue_idr)}
                  </span>
                </p>
                <p>
                  {t("hppCogs")}:{" "}
                  <span className="font-mono tabular-nums">
                    {formatIdr(row.cogs_idr)}
                  </span>
                </p>
                <p>
                  {t("hppMargin")}:{" "}
                  <span
                    className={
                      row.margin_idr < 0
                        ? "font-mono tabular-nums text-destructive"
                        : "font-mono tabular-nums"
                    }
                  >
                    {formatIdr(row.margin_idr)}
                  </span>
                  {row.margin_pct != null ? ` (${row.margin_pct}%)` : ""}
                </p>
                {row.line === "host" && row.host_cogs_capped ? (
                  <p className="text-[11px] text-muted-foreground">
                    {t("hppHostCogsCapped", {
                      cap: row.host_scans_cap ?? 0,
                      raw: row.host_scans_raw ?? 0,
                    })}
                  </p>
                ) : null}
                <Badge variant="info" className="text-[10px]">
                  {row.label}
                </Badge>
              </AdminShellBody>
            </AdminShell>
          ))}
        </div>
      </div>

      <AdminShell
        tone={reportTone(report?.unallocated_overhead_idr)}
        testid="hpp-report-card"
      >
        <AdminShellHead
          icon={Calculator}
          title={t("hppReportCard")}
          hint={t("hppReportHint")}
        />
        <AdminShellBody>
          {reportLoading ? (
            <TableRowSkeleton rows={5} columns={7} />
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
              <div className="overflow-hidden rounded-md border border-border">
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
                      <TableRow key={line.key} className="h-12 hover:bg-muted/50">
                        <TableCell className="relative pl-4">
                          <SiemRail className="bg-primary" />
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
              </div>
            </>
          )}
        </AdminShellBody>
      </AdminShell>
    </div>
  );
}

export default AdminHpp;
