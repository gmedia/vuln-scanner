import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Tags } from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";

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

function skuLabel(sku: string): string {
  if (!sku) return sku;
  return sku.charAt(0).toUpperCase() + sku.slice(1);
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

function AdminSkuCatalog() {
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

  const tierLabel = (tier: "basic" | "pro" | "multi"): string => {
    switch (tier) {
      case "basic": return t("bundleTierBasic");
      case "pro": return t("bundleTierPro");
      case "multi": return t("bundleTierMulti");
    }
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
      <PageHeader
        leading={<Tags className="h-6 w-6 shrink-0 text-primary" />}
        title={t("skuTitle")}
        description={t("skuHint")}
      />

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
                        {skuLabel(row.sku)}
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
                    <TableCell className="py-1.5 text-xs">{tierLabel(b.tier)}</TableCell>
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
                    sku: skuLabel(pending.row.sku),
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

export default AdminSkuCatalog;
