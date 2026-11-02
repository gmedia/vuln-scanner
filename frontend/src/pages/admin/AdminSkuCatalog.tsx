import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Layers, Package, Tags } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  adminApi,
  type InvoiceProduct,
  type SkuCatalogItem,
} from "@/api/admin";
import {
  AdminNotice,
  AdminShell,
  AdminShellBody,
  AdminShellHead,
} from "@/components/admin/AdminShell";
import PageHeader from "@/components/layout/PageHeader";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/Tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import AdminSkuTierPanel from "@/pages/admin/AdminSkuTierPanel";

interface SkuDraft {
  listIdr: string;
  invoicable: boolean;
}

interface PendingSave {
  row: SkuCatalogItem;
  listIdr: number;
  invoicable: boolean;
}

function rowKey(product: string, sku: string): string {
  return `${product}:${sku}`;
}

function parseListIdr(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

function formatUpdated(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("id-ID");
}

function formatIdr(n: number): string {
  return n.toLocaleString("id-ID");
}

export function AdminSkuPricePanel() {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, SkuDraft>>({});
  const [pending, setPending] = useState<PendingSave | null>(null);

  const { data: catalog } = useQuery({
    queryKey: ["admin-sku-catalog"],
    queryFn: adminApi.getSkuCatalog,
  });
  const { data: pricing } = useQuery({
    queryKey: ["admin-sku-pricing"],
    queryFn: adminApi.getSkuPricing,
  });

  const draftFor = (row: SkuCatalogItem): SkuDraft =>
    drafts[rowKey(row.product, row.sku)] ?? {
      listIdr: String(row.list_idr),
      invoicable: row.invoicable,
    };

  const save = useMutation({
    mutationFn: (body: PendingSave) =>
      adminApi.updateSkuCatalog(body.row.product, body.row.sku, {
        list_idr: body.listIdr,
        invoicable: body.invoicable,
      }),
    onSuccess: () => {
      toast.success(t("skuSaved"));
      void queryClient.invalidateQueries({ queryKey: ["admin-sku-catalog"] });
      setPending(null);
    },
    onError: () => {
      toast.error(t("skuSaveFail"));
    },
  });

  const productLabel = (product: InvoiceProduct): string => {
    if (product === "scan") return t("skuProductScan");
    if (product === "host") return t("skuProductHost");
    if (product === "uptime") return t("skuProductUptime");
    return t("skuProductGuard");
  };

  const patchDraft = (row: SkuCatalogItem, patch: Partial<SkuDraft>) => {
    const key = rowKey(row.product, row.sku);
    setDrafts((prev) => {
      const current = prev[key] ?? {
        listIdr: String(row.list_idr),
        invoicable: row.invoicable,
      };
      return { ...prev, [key]: { ...current, ...patch } };
    });
  };

  return (
    <div className="w-full space-y-6">
      <AdminShell testid="sku-catalog-guide" tone="info">
        <AdminShellHead icon={BookOpen} title={t("skuGuideTitle")} hint={t("skuGuideHint")} />
        <AdminShellBody>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="steps">
              <AccordionTrigger>{t("skuGuideStepsTitle")}</AccordionTrigger>
              <AccordionContent>
                <ol className="ml-4 list-decimal space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <li>{t("skuGuideStep1")}</li>
                  <li>{t("skuGuideStep2")}</li>
                  <li>{t("skuGuideStep3")}</li>
                  <li>{t("skuGuideStep4")}</li>
                </ol>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="pricing">
              <AccordionTrigger>{t("skuGuidePricingTitle")}</AccordionTrigger>
              <AccordionContent>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("skuGuidePricingBody")}
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="invoicable">
              <AccordionTrigger>{t("skuGuideInvoicableTitle")}</AccordionTrigger>
              <AccordionContent>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("skuGuideInvoicableBody")}
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="limits">
              <AccordionTrigger>{t("skuGuideLimitsTitle")}</AccordionTrigger>
              <AccordionContent>
                <ul className="ml-4 list-disc space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <li>{t("skuGuideLimit1")}</li>
                  <li>{t("skuGuideLimit2")}</li>
                  <li>{t("skuGuideLimit3")}</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </AdminShellBody>
      </AdminShell>

      <AdminShell testid="sku-catalog-card">
        <AdminShellHead icon={Tags} title={t("skuTitle")} hint={t("skuHint")} />
        <AdminShellBody className="space-y-3">
          <AdminNotice tone="warn" role="status">
            {t("skuLockWarning")}
          </AdminNotice>

          <div className="overflow-hidden rounded-md border border-border">
            <Table data-testid="sku-catalog-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                    {t("skuColProduct")}
                  </TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                    {t("skuColSku")}
                  </TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                    {t("skuColPrice")}
                  </TableHead>
                  <TableHead
                    className="py-2 text-[10px] uppercase tracking-wider"
                    title={t("skuSeatsReadonly")}
                  >
                    {t("skuColSeats")}
                  </TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                    {t("skuColInvoicable")}
                  </TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                    {t("skuColUpdated")}
                  </TableHead>
                  <TableHead className="py-2 text-right text-[10px] uppercase tracking-wider">
                    {t("skuColAction")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(catalog ?? []).map((row) => {
                  const key = rowKey(row.product, row.sku);
                  const draft = draftFor(row);
                  const parsed = parseListIdr(draft.listIdr);
                  const dirty =
                    parsed != null &&
                    (parsed !== row.list_idr ||
                      draft.invoicable !== row.invoicable);
                  const priceId = `sku-catalog-price-${row.product}-${row.sku}`;
                  return (
                    <TableRow
                      key={key}
                      data-testid={`sku-catalog-row-${row.product}-${row.sku}`}
                      className="hover:bg-muted/50"
                    >
                      <TableCell className="py-1.5 text-sm text-foreground">
                        {productLabel(row.product)}
                      </TableCell>
                      <TableCell className="py-1.5 text-sm text-foreground">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {row.label || row.sku}
                          {row.active === false ? (
                            <Badge
                              variant="default"
                              className="text-[10px] uppercase"
                              data-testid={`sku-catalog-retired-${row.product}-${row.sku}`}
                            >
                              {t("skuStatusRetired")}
                            </Badge>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Label htmlFor={priceId} className="sr-only">
                          {t("skuColPrice")}
                        </Label>
                        <Input
                          id={priceId}
                          data-testid={priceId}
                          inputMode="numeric"
                          value={draft.listIdr}
                          onChange={(e) =>
                            patchDraft(row, { listIdr: e.target.value })
                          }
                          className="h-10 min-h-10 font-mono text-xs tabular-nums"
                        />
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-xs tabular-nums text-foreground">
                        {row.seats}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Checkbox
                          data-testid={`sku-catalog-invoicable-${row.product}-${row.sku}`}
                          checked={draft.invoicable}
                          onCheckedChange={(checked) =>
                            patchDraft(row, { invoicable: checked === true })
                          }
                          aria-label={t("skuColInvoicable")}
                        />
                      </TableCell>
                      <TableCell className="py-1.5 text-xs text-muted-foreground">
                        <span className="block font-mono tabular-nums">{formatUpdated(row.updated_at)}</span>
                        {row.updated_by_email ? (
                          <span
                            className="block text-[11px]"
                            data-testid={`sku-catalog-actor-${row.product}-${row.sku}`}
                            title={row.updated_by_email}
                          >
                            {t("skuUpdatedBy", { email: row.updated_by_email })}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="py-1.5 text-right">
                        <Button
                          type="button"
                          size="sm"
                          data-testid={`sku-catalog-save-${row.product}-${row.sku}`}
                          disabled={!dirty || save.isPending}
                          onClick={() => {
                            if (parsed == null) return;
                            setPending({
                              row,
                              listIdr: parsed,
                              invoicable: draft.invoicable,
                            });
                          }}
                        >
                          {t("skuSave")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">
            {t("skuSeatsReadonly")}
          </p>
        </AdminShellBody>
      </AdminShell>

      <AdminShell testid="sku-bundle-card">
        <AdminShellHead icon={Package} title={t("bundleTitle")} hint={t("bundleHint")} />
        <AdminShellBody className="space-y-3">
          <AdminNotice tone="info" role="status">
            {t("bundleLockedNotice")}
          </AdminNotice>
          <div className="overflow-hidden rounded-md border border-border">
            <Table data-testid="sku-bundle-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                    {t("bundleColTier")}
                  </TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                    {t("bundleColBundle")}
                  </TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                    {t("bundleColAlacarte")}
                  </TableHead>
                  <TableHead className="py-2 text-[10px] uppercase tracking-wider">
                    {t("bundleColSaving")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(pricing?.bundles ?? []).map((b) => (
                  <TableRow key={b.tier} data-testid={`sku-bundle-row-${b.tier}`}>
                    <TableCell className="py-1.5 text-xs">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {b.label || b.tier}
                        {b.active === false ? (
                          <Badge
                            variant="default"
                            className="text-[10px] uppercase"
                          >
                            {t("skuStatusRetired")}
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 font-mono text-xs tabular-nums">
                      {formatIdr(b.bundle_idr)}
                    </TableCell>
                    <TableCell className="py-1.5 font-mono text-xs tabular-nums">
                      {formatIdr(b.alacarte_idr)}
                    </TableCell>
                    <TableCell className="py-1.5 font-mono text-xs tabular-nums">
                      {formatIdr(b.saving_idr)} ({b.saving_pct.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {pricing?.annual ? (
            <p data-testid="sku-annual-note" className="text-[11px] text-muted-foreground">
              {t("bundleAnnualNote", {
                paid: pricing.annual.months_paid,
                served: pricing.annual.months_served,
              })}
            </p>
          ) : null}
        </AdminShellBody>
      </AdminShell>

      <AlertDialog
        open={pending != null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("skuConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending
                ? t("skuConfirmBody", {
                    product: productLabel(pending.row.product),
                    sku: pending.row.label || pending.row.sku,
                    oldPrice: pending.row.list_idr.toLocaleString("id-ID"),
                    newPrice: pending.listIdr.toLocaleString("id-ID"),
                  })
                : null}
              {pending && pending.invoicable !== pending.row.invoicable ? (
                <span className="mt-1 block">
                  {t("skuColInvoicable")}:{" "}
                  {pending.row.invoicable ? t("yes") : t("no")} →{" "}
                  {pending.invoicable ? t("yes") : t("no")}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={save.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!pending) return;
                save.mutate(pending);
              }}
            >
              {t("skuConfirmCta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AdminSkuCatalog() {
  const { t } = useTranslation("admin");
  const [tab, setTab] = useState("pricing");

  return (
    <div className="w-full space-y-6">
      <PageHeader
        leading={<Tags className="h-6 w-6 shrink-0 text-primary-text" />}
        title={t("skuTitle")}
        description={t("skuHint")}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList
          variant="line"
          className="w-full flex-wrap justify-start sm:flex-nowrap"
        >
          <TabsTrigger
            value="pricing"
            className="gap-1.5"
            data-testid="sku-tab-pricing"
          >
            <Tags aria-hidden />
            {t("skuTabPricing")}
          </TabsTrigger>
          <TabsTrigger
            value="tiers"
            className="gap-1.5"
            data-testid="sku-tab-tiers"
          >
            <Layers aria-hidden />
            {t("skuTabTiers")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="pricing" className="mt-4">
          <AdminSkuPricePanel />
        </TabsContent>
        <TabsContent value="tiers" className="mt-4">
          <AdminSkuTierPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AdminSkuCatalog;
