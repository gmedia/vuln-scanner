import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator } from "lucide-react";
import { adminApi, type SkuCatalogItem } from "@/api/admin";
import {
  AdminNotice,
  AdminShell,
  AdminShellBody,
  AdminShellHead,
} from "@/components/admin/AdminShell";
import { marginTone } from "@/components/admin/adminChrome";
import PageHeader from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
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
import {
  computeScenario,
  type ScenarioRowInput,
  type ScenarioRowOutput,
  type ScenarioService,
  type ScenarioSku,
} from "@/lib/hppScenario";
import { useTranslation } from "react-i18next";

const SERVICES: readonly ScenarioService[] = [
  "scan",
  "host",
  "uptime",
  "guard",
];

const SKUS: readonly ScenarioSku[] = ["basic", "pro", "multi"];

const LIST_FALLBACK: Record<"scan" | "host", Record<ScenarioSku, number>> = {
  scan: { basic: 300000, pro: 650000, multi: 2000000 },
  host: { basic: 150000, pro: 350000, multi: 900000 },
};

interface RowDraft {
  sku: ScenarioSku | "";
  volume: string;
  unitCost: string;
  price: string;
}

function emptyRows(): Record<ScenarioService, RowDraft> {
  return {
    scan: { sku: "basic", volume: "", unitCost: "", price: "" },
    host: { sku: "basic", volume: "", unitCost: "", price: "" },
    uptime: { sku: "", volume: "", unitCost: "", price: "" },
    guard: { sku: "", volume: "", unitCost: "", price: "" },
  };
}

function formatIdr(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("id-ID");
}

function toNumber(s: string): number {
  const trimmed = s.trim();
  if (trimmed === "") return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : 0;
}

function catalogPrice(
  catalog: readonly SkuCatalogItem[] | undefined,
  product: "scan" | "host",
  sku: ScenarioSku,
): number {
  const hit = catalog?.find((row) => row.product === product && row.sku === sku);
  return hit?.list_idr ?? LIST_FALLBACK[product][sku];
}

function AdminHppSimulator() {
  const { t } = useTranslation("admin");
  const [fixedCost, setFixedCost] = useState("");
  const [targetMargin, setTargetMargin] = useState("");
  const [rows, setRows] = useState(emptyRows);

  const { data: catalog } = useQuery({
    queryKey: ["admin-sku-catalog"],
    queryFn: adminApi.getSkuCatalog,
  });

  const scenarioRows: ScenarioRowInput[] = SERVICES.map((service) => {
    const draft = rows[service];
    const sku =
      service === "scan" || service === "host"
        ? draft.sku || undefined
        : undefined;
    return {
      service,
      sku,
      volume: toNumber(draft.volume),
      unit_cost_idr: toNumber(draft.unitCost),
      price_idr: toNumber(draft.price),
    };
  });

  const scenario = computeScenario({
    fixed_cost_idr: toNumber(fixedCost),
    target_margin_pct:
      targetMargin.trim() === "" ? null : toNumber(targetMargin),
    rows: scenarioRows,
  });

  const byService = new Map<ScenarioService, ScenarioRowOutput>(
    scenario.rows.map((row) => [row.service, row]),
  );

  const serviceLabel: Record<ScenarioService, string> = {
    scan: t("simServiceScan"),
    host: t("simServiceHost"),
    uptime: t("simServiceUptime"),
    guard: t("simServiceGuard"),
  };

  const skuLabel: Record<ScenarioSku, string> = {
    basic: t("simSkuBasic"),
    pro: t("simSkuPro"),
    multi: t("simSkuMulti"),
  };

  const patchRow = (service: ScenarioService, patch: Partial<RowDraft>) => {
    setRows((prev) => ({ ...prev, [service]: { ...prev[service], ...patch } }));
  };

  const onSku = (service: "scan" | "host", sku: ScenarioSku) => {
    setRows((prev) => {
      const current = prev[service];
      const price =
        current.price.trim() === ""
          ? String(catalogPrice(catalog, service, sku))
          : current.price;
      return { ...prev, [service]: { ...current, sku, price } };
    });
  };

  const showTarget = targetMargin.trim() !== "" && Number.isFinite(Number(targetMargin));

  return (
    <div className="w-full space-y-6">
      <PageHeader title={t("simTitle")} description={t("simSubtitle")} />

      <div data-testid="hpp-sim-banner">
        <AdminNotice tone="warn" role="status">
          {t("simBanner")}
        </AdminNotice>
      </div>

      <AdminShell testid="hpp-sim-inputs">
        <AdminShellHead
          icon={Calculator}
          title={t("simInputsTitle")}
          hint={t("simInputsHint")}
        />
        <AdminShellBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="hpp-sim-fixed-cost">{t("simFixedCost")}</Label>
              <Input
                id="hpp-sim-fixed-cost"
                data-testid="hpp-sim-fixed-cost"
                inputMode="numeric"
                value={fixedCost}
                onChange={(e) => setFixedCost(e.target.value)}
                className="h-10 min-h-10 font-mono text-xs tabular-nums"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="hpp-sim-target-margin">{t("simTargetMargin")}</Label>
              <Input
                id="hpp-sim-target-margin"
                data-testid="hpp-sim-target-margin"
                inputMode="numeric"
                value={targetMargin}
                onChange={(e) => setTargetMargin(e.target.value)}
                className="h-10 min-h-10 font-mono text-xs tabular-nums"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-border">
            <Table data-testid="hpp-sim-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                    {t("simColService")}
                  </TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                    {t("simColSku")}
                  </TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                    {t("simColVolume")}
                  </TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                    {t("simColUnitCost")}
                  </TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                    {t("simColPrice")}
                  </TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                    {t("simColHpp")}
                  </TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                    {t("simColMargin")}
                  </TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                    {t("simColMarginPct")}
                  </TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                    {t("simColBep")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SERVICES.map((service) => {
                  const draft = rows[service];
                  const out = byService.get(service);
                  const manual = service === "uptime" || service === "guard";
                  const marginClass =
                    out && out.computed
                      ? marginTone(out.margin_idr) === "danger"
                        ? "text-red-400"
                        : "text-primary"
                      : undefined;
                  return (
                    <TableRow
                      key={service}
                      data-testid={`hpp-sim-row-${service}`}
                      className="hover:bg-muted/50"
                    >
                      <TableCell className="py-1.5">
                        <span className="text-sm text-foreground">
                          {serviceLabel[service]}
                        </span>
                        {manual ? (
                          <Badge variant="default" className="ml-2 text-[10px]">
                            {t("simManualBadge")}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="py-1.5">
                        {manual ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Select
                            value={draft.sku || "basic"}
                            onValueChange={(value) =>
                              onSku(service, value as ScenarioSku)
                            }
                          >
                            <SelectTrigger
                              data-testid={`hpp-sim-sku-${service}`}
                              aria-label={t("simColSku")}
                              className="h-10 min-h-10 w-[7.5rem]"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SKUS.map((sku) => (
                                <SelectItem key={sku} value={sku}>
                                  {skuLabel[sku]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Input
                          data-testid={`hpp-sim-volume-${service}`}
                          aria-label={t("simColVolume")}
                          inputMode="numeric"
                          value={draft.volume}
                          onChange={(e) =>
                            patchRow(service, { volume: e.target.value })
                          }
                          className="h-10 min-h-10 font-mono text-xs tabular-nums"
                        />
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Input
                          data-testid={`hpp-sim-unitcost-${service}`}
                          aria-label={t("simColUnitCost")}
                          inputMode="numeric"
                          value={draft.unitCost}
                          onChange={(e) =>
                            patchRow(service, { unitCost: e.target.value })
                          }
                          className="h-10 min-h-10 font-mono text-xs tabular-nums"
                        />
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Input
                          data-testid={`hpp-sim-price-${service}`}
                          aria-label={t("simColPrice")}
                          inputMode="numeric"
                          value={draft.price}
                          onChange={(e) =>
                            patchRow(service, { price: e.target.value })
                          }
                          className="h-10 min-h-10 font-mono text-xs tabular-nums"
                        />
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-xs tabular-nums">
                        {formatIdr(out?.hpp_idr)}
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-xs tabular-nums">
                        {out && out.computed ? (
                          <span className={marginClass}>
                            {formatIdr(out.margin_idr)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-xs tabular-nums">
                        {out && out.computed && out.margin_pct != null ? (
                          `${out.margin_pct}%`
                        ) : (
                          <span className="text-muted-foreground">
                            — {t("simNotComputed")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-xs tabular-nums">
                        {out?.break_even_volume == null
                          ? "—"
                          : out.break_even_volume}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow data-testid="hpp-sim-totals" className="hover:bg-muted/50">
                  <TableCell className="py-1.5 text-sm font-medium">
                    {t("simTotals")}
                  </TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  <TableCell className="py-1.5 font-mono text-xs tabular-nums">
                    {formatIdr(scenario.totals.revenue_idr)}
                  </TableCell>
                  <TableCell className="py-1.5 font-mono text-xs tabular-nums">
                    {formatIdr(scenario.totals.fully_loaded_hpp_idr)}
                  </TableCell>
                  <TableCell
                    className={
                      marginTone(scenario.totals.margin_idr) === "danger"
                        ? "py-1.5 font-mono text-xs tabular-nums text-red-400"
                        : "py-1.5 font-mono text-xs tabular-nums text-primary"
                    }
                  >
                    {formatIdr(scenario.totals.margin_idr)}
                  </TableCell>
                  <TableCell className="py-1.5 font-mono text-xs tabular-nums">
                    {scenario.totals.margin_pct == null
                      ? "—"
                      : `${scenario.totals.margin_pct}%`}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {showTarget ? (
            <p
              data-testid="hpp-sim-target-price"
              className="text-xs text-muted-foreground"
            >
              {t("simTargetPriceLabel")}:{" "}
              {SERVICES.map((service) => {
                const out = byService.get(service);
                return (
                  <span key={service} className="mr-3 inline-block">
                    <span className="text-foreground">{serviceLabel[service]}</span>{" "}
                    <span className="font-mono tabular-nums text-foreground">
                      {formatIdr(out?.target_price_idr)}
                    </span>
                  </span>
                );
              })}
            </p>
          ) : null}
        </AdminShellBody>
      </AdminShell>
    </div>
  );
}

export default AdminHppSimulator;
