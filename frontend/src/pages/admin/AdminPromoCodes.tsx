import { useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { BadgePercent, BookOpen, Plus, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  adminApi,
  type PromoCode,
  type PromoProduct,
  type PromoStatusFilter,
} from "@/api/admin";
import { AdminShell, AdminShellBody, AdminShellHead } from "@/components/admin/AdminShell";
import { adminRailClass } from "@/components/admin/adminChrome";
import { PromoHistorySheet, PromoRedemptionsSheet } from "@/components/admin/PromoSheets";
import { PromoRowActions } from "@/components/admin/PromoRowActions";
import PageHeader from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/patterns/EmptyState";
import { SiemRail } from "@/components/siem/siemChrome";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/Pagination";
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { formatIdr } from "@/components/invoice/invoicePrintFormat";
import { emailLogPageItems } from "@/lib/pagination";
import {
  buildPromoBody,
  EMPTY_PROMO_FORM,
  promoFormFrom,
  validatePromoForm,
  type PromoFormState,
} from "@/lib/promoForm";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/api/apiErrors";

const PAGE_SIZE = 20;
const STATUS_ALL = "all";
const PRODUCTS: PromoProduct[] = ["scan", "host", "uptime", "guard"];

function formatDiscount(item: PromoCode): string {
  if (item.kind === "percent" && item.percent_off_bp != null) {
    return `${item.percent_off_bp / 100}%`;
  }
  return item.amount_idr == null ? "—" : formatIdr(item.amount_idr);
}

function formatWindow(item: PromoCode): string {
  if (!item.starts_at && !item.ends_at) return "—";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  return `${item.starts_at ? fmt(item.starts_at) : "…"} – ${item.ends_at ? fmt(item.ends_at) : "…"}`;
}

function statusTone(item: PromoCode): "success" | "idle" {
  return item.active ? "success" : "idle";
}

function AdminPromoCodes() {
  const { t } = useTranslation("admin");
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [qDraft, setQDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState<string>(STATUS_ALL);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>(STATUS_ALL);

  const [form, setForm] = useState<PromoFormState | null>(null);
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PromoCode | null>(null);
  const [redemptionsTarget, setRedemptionsTarget] = useState<PromoCode | null>(null);
  const [historyTarget, setHistoryTarget] = useState<PromoCode | null>(null);

  const listQ = useQuery({
    queryKey: ["admin-promo-codes", page, q, status],
    queryFn: () =>
      adminApi.listAdminPromoCodes({
        page,
        page_size: PAGE_SIZE,
        q: q || undefined,
        status: status === STATUS_ALL ? undefined : (status as PromoStatusFilter),
      }),
    placeholderData: keepPreviousData,
  });
  const tiersQ = useQuery({ queryKey: ["admin-sku-tiers"], queryFn: adminApi.getAdminSkuTiers });

  const items = listQ.data?.items ?? [];
  const pages = Math.max(1, Math.ceil((listQ.data?.total ?? 0) / PAGE_SIZE));
  const errors = useMemo(() => (form ? validatePromoForm(form) : {}), [form]);
  const invalid = Object.keys(errors).length > 0;
  const termsLocked = (editing?.redemption_count ?? 0) > 0;
  const usedLabel = (item: PromoCode) =>
    t("promoUsedOf", {
      used: item.redemption_count,
      limit: item.max_redemptions ?? "∞",
    });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["admin-promo-codes"] });
  }

  const saveMut = useMutation({
    mutationFn: () => {
      const body = buildPromoBody(form!);
      return editing ? adminApi.updateAdminPromoCode(editing.id, body) : adminApi.createAdminPromoCode(body);
    },
    onSuccess: () => {
      toast.success(editing ? t("promoSaved") : t("promoCreated"));
      setForm(null);
      setEditing(null);
      refresh();
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, t("promoSaveFail"))),
  });
  const approveMut = useMutation({
    mutationFn: (item: PromoCode) => adminApi.approveAdminPromoCode(item.id),
    onSuccess: () => {
      toast.success(t("promoApproved"));
      refresh();
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, t("promoApproveFail"))),
  });
  const toggleMut = useMutation({
    mutationFn: (item: PromoCode) =>
      item.active ? adminApi.deactivateAdminPromoCode(item.id) : adminApi.reactivateAdminPromoCode(item.id),
    onSuccess: () => {
      toast.success(t("promoToggled"));
      refresh();
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, t("promoToggleFail"))),
  });
  const deleteMut = useMutation({
    mutationFn: (item: PromoCode) => adminApi.deleteAdminPromoCode(item.id),
    onSuccess: () => {
      toast.success(t("promoDeleted"));
      setDeleteTarget(null);
      refresh();
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, t("promoDeleteFail"))),
  });

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_PROMO_FORM });
  }

  function openEdit(item: PromoCode) {
    setEditing(item);
    setForm(promoFormFrom(item));
  }

  function patch(next: Partial<PromoFormState>) {
    setForm((current) => (current ? { ...current, ...next } : current));
  }

  function applyFilters() {
    setQ(qDraft.trim());
    setStatus(statusDraft);
    setPage(1);
  }

  function clearFilters() {
    setQDraft("");
    setStatusDraft(STATUS_ALL);
    setQ("");
    setStatus(STATUS_ALL);
    setPage(1);
  }

  return (
    <div className="w-full space-y-6" data-testid="admin-promo-codes-page">
      <PageHeader
        leading={<BadgePercent className="h-6 w-6 shrink-0 text-primary-text" />}
        title={t("promoTitle")}
        description={t("promoSubtitle")}
        actions={
          <Button type="button" onClick={openCreate} data-testid="promo-create">
            <Plus className="mr-1 h-4 w-4" />
            {t("promoCreate")}
          </Button>
        }
      />

      <AdminShell testid="promo-guide" tone="info">
        <AdminShellHead
          icon={BookOpen}
          title={t("promoGuideTitle")}
          hint={t("promoGuideHint")}
        />
        <AdminShellBody>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="steps">
              <AccordionTrigger>{t("promoGuideStepsTitle")}</AccordionTrigger>
              <AccordionContent>
                <ol className="ml-4 list-decimal space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <li>{t("promoGuideStep1")}</li>
                  <li>{t("promoGuideStep2")}</li>
                  <li>{t("promoGuideStep3")}</li>
                  <li>{t("promoGuideStep4")}</li>
                  <li>{t("promoGuideStep5")}</li>
                </ol>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="types">
              <AccordionTrigger>{t("promoGuideTypesTitle")}</AccordionTrigger>
              <AccordionContent>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("promoGuideTypesBody")}
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="approval">
              <AccordionTrigger>{t("promoGuideApprovalTitle")}</AccordionTrigger>
              <AccordionContent>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("promoGuideApprovalBody")}
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="limits">
              <AccordionTrigger>{t("promoGuideLimitsTitle")}</AccordionTrigger>
              <AccordionContent>
                <ul className="ml-4 list-disc space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <li>{t("promoGuideLimit1")}</li>
                  <li>{t("promoGuideLimit2")}</li>
                  <li>{t("promoGuideLimit3")}</li>
                  <li>{t("promoGuideLimit4")}</li>
                  <li>{t("promoGuideLimit5")}</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </AdminShellBody>
      </AdminShell>

      <AdminShell tone="primary">
        <AdminShellHead icon={Tag} title={t("promoListCard")} aside={<span className="text-[10px] text-muted-foreground">{t("totalCount", { count: listQ.data?.total ?? 0 })}</span>} />
        <AdminShellBody className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="promo-search">{t("promoSearch")}</Label>
              <Input id="promo-search" className="h-10 min-h-10" value={qDraft} onChange={(e) => setQDraft(e.target.value)} placeholder={t("promoSearchPlaceholder")} />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="promo-status">{t("promoStatus")}</Label>
              <Select value={statusDraft} onValueChange={setStatusDraft}>
                <SelectTrigger id="promo-status" className="h-10 min-h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={STATUS_ALL}>{t("promoStatusAll")}</SelectItem>
                  <SelectItem value="active">{t("promoStatusActive")}</SelectItem>
                  <SelectItem value="inactive">{t("promoStatusInactive")}</SelectItem>
                  <SelectItem value="expired">{t("promoStatusExpired")}</SelectItem>
                  <SelectItem value="scheduled">{t("promoStatusScheduled")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button type="button" className="min-h-11 w-full sm:min-h-10 sm:w-auto" onClick={applyFilters} data-testid="promo-filter-apply">{t("promoApply")}</Button>
              <Button type="button" variant="outline" className="min-h-11 w-full sm:min-h-10 sm:w-auto" onClick={clearFilters} data-testid="promo-filter-clear">{t("promoClear")}</Button>
            </div>
          </div>

          {listQ.isLoading ? (
            <TableRowSkeleton rows={5} columns={7} />
          ) : listQ.isError ? (
            <EmptyState testId="promo-error" icon={BadgePercent} title={t("promoLoadError")} action={<Button type="button" variant="outline" size="sm" onClick={() => void listQ.refetch()}>{t("promoRetry")}</Button>} />
          ) : items.length === 0 ? (
            <EmptyState testId="promo-empty" icon={BadgePercent} title={t("promoEmpty")} hint={t("promoEmptyHint")} />
          ) : (
            <>
              <div className="space-y-2 md:hidden" data-testid="promo-cards-mobile">
                {items.map((item) => (
                  <div key={item.id} className="relative w-full overflow-hidden rounded-lg border border-border bg-card p-3 pl-4">
                    <SiemRail className={adminRailClass(statusTone(item))} />
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm text-foreground">{item.code}</p>
                      <Badge variant={item.active ? "success" : "default"} className="text-[10px] uppercase">{item.active ? t("promoActive") : t("promoInactive")}</Badge>
                      {item.requires_approval && !item.approved_at ? (
                        <Badge variant="pending" className="text-[10px] uppercase" data-testid={`promo-needs-approval-${item.id}`}>{t("promoNeedsApproval")}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{item.description || "—"}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDiscount(item)} · {item.applies_to_product ?? t("promoScopeAll")} · {formatWindow(item)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {usedLabel(item)}
                    </p>
                    <div className="mt-3 flex justify-end">
                      <PromoRowActions item={item} onEdit={openEdit} onApprove={(row) => approveMut.mutate(row)} onToggle={(row) => toggleMut.mutate(row)} onRedemptions={setRedemptionsTarget} onHistory={setHistoryTarget} onDelete={setDeleteTarget} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-md border border-border md:block" data-testid="promo-table-desktop">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("promoColCode")}</TableHead>
                      <TableHead>{t("promoColDiscount")}</TableHead>
                      <TableHead>{t("promoColScope")}</TableHead>
                      <TableHead>{t("promoColWindow")}</TableHead>
                      <TableHead>{t("promoColLimits")}</TableHead>
                      <TableHead>{t("promoUsed")}</TableHead>
                      <TableHead>{t("promoColStatus")}</TableHead>
                      <TableHead className="text-right">{t("colActions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id} className="hover:bg-muted/50">
                        <TableCell className="relative pl-4">
                          <SiemRail className={adminRailClass(statusTone(item))} />
                          <p className="font-mono text-xs text-foreground">{item.code}</p>
                          <p className="max-w-[16rem] truncate text-[11px] text-muted-foreground">{item.description || "—"}</p>
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">{formatDiscount(item)}</TableCell>
                        <TableCell className="text-xs">{item.applies_to_product ?? t("promoScopeAll")}{item.applies_to_sku ? ` · ${item.applies_to_sku}` : ""}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatWindow(item)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.max_redemptions == null ? "∞" : item.max_redemptions} / {item.max_redemptions_per_org}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground" data-testid={`promo-used-${item.id}`}>
                          {usedLabel(item)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge variant={item.active ? "success" : "default"} className="text-[10px] uppercase">{item.active ? t("promoActive") : t("promoInactive")}</Badge>
                            {item.requires_approval && !item.approved_at ? (
                              <Badge variant="pending" className="text-[10px] uppercase" data-testid={`promo-needs-approval-${item.id}`}>{t("promoNeedsApproval")}</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end">
                            <PromoRowActions item={item} onEdit={openEdit} onApprove={(row) => approveMut.mutate(row)} onToggle={(row) => toggleMut.mutate(row)} onRedemptions={setRedemptionsTarget} onHistory={setHistoryTarget} onDelete={setDeleteTarget} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {pages > 1 ? (
                <Pagination className="mt-4" data-testid="promo-pagination">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-disabled={page <= 1} />
                    </PaginationItem>
                    {emailLogPageItems(page, pages).map((item, idx) =>
                      item === "ellipsis" ? (
                        <PaginationItem key={`e-${idx}`}><PaginationEllipsis /></PaginationItem>
                      ) : (
                        <PaginationItem key={item}><PaginationLink isActive={item === page} onClick={() => setPage(item)}>{item}</PaginationLink></PaginationItem>
                      ),
                    )}
                    <PaginationItem>
                      <PaginationNext onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} aria-disabled={page >= pages} />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              ) : null}
            </>
          )}
        </AdminShellBody>
      </AdminShell>

      <Sheet open={form != null} onOpenChange={(open) => { if (!open) { setForm(null); setEditing(null); } }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg" data-testid="promo-form">
          <SheetHeader>
            <SheetTitle>{editing ? t("promoEditTitle", { code: editing.code }) : t("promoCreateTitle")}</SheetTitle>
            <SheetDescription>{t("promoFormHint")}</SheetDescription>
          </SheetHeader>
          {form ? (
            <form className="space-y-4 px-4 pb-4" onSubmit={(e) => { e.preventDefault(); if (!invalid) saveMut.mutate(); }}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="promo-code">{t("promoFieldCode")}</Label>
                  <Input id="promo-code" data-testid="promo-code" className="h-10 min-h-10 font-mono text-xs uppercase" value={form.code} disabled={editing != null} onBlur={() => patch({ code: form.code.trim().toUpperCase() })} onChange={(e) => patch({ code: e.target.value })} placeholder="LAUNCH2026" aria-invalid={!!errors.code} />
                  {errors.code ? <p className="text-[11px] text-destructive">{t("promoCodeInvalid")}</p> : null}
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="promo-kind">{t("promoFieldKind")}</Label>
                  <Select value={form.kind} onValueChange={(v) => patch({ kind: v === "fixed" ? "fixed" : "percent" })} disabled={termsLocked}>
                    <SelectTrigger id="promo-kind" data-testid="promo-kind" aria-disabled={termsLocked} className="h-10 min-h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">{t("promoKindPercent")}</SelectItem>
                      <SelectItem value="fixed">{t("promoKindFixed")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="promo-description">{t("promoFieldDescription")}</Label>
                <Textarea id="promo-description" value={form.description} maxLength={200} onChange={(e) => patch({ description: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {form.kind === "percent" ? (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="promo-percent">{t("promoFieldPercent")}</Label>
                    <Input id="promo-percent" data-testid="promo-percent" className="h-10 min-h-10 font-mono text-xs" inputMode="decimal" value={form.percent} disabled={termsLocked} aria-disabled={termsLocked} onChange={(e) => patch({ percent: e.target.value })} placeholder="12.5" aria-invalid={!!errors.percent} />
                    {errors.percent ? <p className="text-[11px] text-destructive">{t("promoPercentInvalid")}</p> : null}
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="promo-amount">{t("promoFieldAmount")}</Label>
                    <Input id="promo-amount" data-testid="promo-amount" className="h-10 min-h-10 font-mono text-xs" inputMode="numeric" value={form.amount} disabled={termsLocked} aria-disabled={termsLocked} onChange={(e) => patch({ amount: e.target.value })} placeholder="100000" aria-invalid={!!errors.amount} />
                    {errors.amount ? <p className="text-[11px] text-destructive">{t("promoAmountInvalid")}</p> : null}
                  </div>
                )}
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="promo-min">{t("promoFieldMin")}</Label>
                  <Input id="promo-min" data-testid="promo-min" className="h-10 min-h-10 font-mono text-xs" inputMode="numeric" value={form.min} disabled={termsLocked} aria-disabled={termsLocked} onChange={(e) => patch({ min: e.target.value })} />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="promo-max-discount">{t("promoFieldMaxDiscount")}</Label>
                  <Input id="promo-max-discount" data-testid="promo-max-discount" className="h-10 min-h-10 font-mono text-xs" inputMode="numeric" value={form.maxDiscount} disabled={termsLocked} aria-disabled={termsLocked} onChange={(e) => patch({ maxDiscount: e.target.value })} placeholder={t("promoOptional")} aria-invalid={!!errors.maxDiscount} />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="promo-product">{t("promoFieldProduct")}</Label>
                  <Select value={form.product || "all"} onValueChange={(v) => patch({ product: v === "all" ? "" : (v as PromoProduct) })} disabled={termsLocked}>
                    <SelectTrigger id="promo-product" data-testid="promo-product" aria-disabled={termsLocked} className="h-10 min-h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("promoScopeAll")}</SelectItem>
                      {PRODUCTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="promo-sku">{t("promoFieldSku")}</Label>
                  <Select value={form.sku || "all"} onValueChange={(v) => patch({ sku: v === "all" ? "" : v })} disabled={termsLocked}>
                    <SelectTrigger id="promo-sku" data-testid="promo-sku" aria-disabled={termsLocked} className="h-10 min-h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("promoScopeAll")}</SelectItem>
                      {(tiersQ.data ?? []).map((tier) => <SelectItem key={tier.code} value={tier.code}>{tier.label || tier.code}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="promo-starts-at">{t("promoFieldStartsAt")}</Label>
                  <DateTimePicker id="promo-starts-at" value={form.startsAt} onChange={(v) => patch({ startsAt: v })} placeholder={t("promoOptional")} clearLabel={t("promoClear")} hourLabel={t("promoHour")} minuteLabel={t("promoMinute")} />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="promo-ends-at">{t("promoFieldEndsAt")}</Label>
                  <DateTimePicker id="promo-ends-at" value={form.endsAt} onChange={(v) => patch({ endsAt: v })} placeholder={t("promoOptional")} clearLabel={t("promoClear")} hourLabel={t("promoHour")} minuteLabel={t("promoMinute")} />
                  {errors.endsAt ? <p className="text-[11px] text-destructive">{t("promoWindowInvalid")}</p> : null}
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="promo-max-redemptions">{t("promoFieldMaxRedemptions")}</Label>
                  <Input id="promo-max-redemptions" data-testid="promo-max-redemptions" className="h-10 min-h-10 font-mono text-xs" inputMode="numeric" value={form.maxRedemptions} onChange={(e) => patch({ maxRedemptions: e.target.value })} placeholder={t("promoOptional")} aria-invalid={!!errors.maxRedemptions} />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="promo-max-per-org">{t("promoFieldMaxPerOrg")}</Label>
                  <Input id="promo-max-per-org" data-testid="promo-max-per-org" className="h-10 min-h-10 font-mono text-xs" inputMode="numeric" value={form.maxPerOrg} onChange={(e) => patch({ maxPerOrg: e.target.value })} aria-invalid={!!errors.maxPerOrg} />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground" data-testid={termsLocked ? "promo-terms-locked" : undefined}>{termsLocked ? t("promoTermsLocked") : t("promoImmutableHint")}</p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setForm(null); setEditing(null); }}>{t("cancel")}</Button>
                <Button type="submit" disabled={invalid || saveMut.isPending} data-testid="promo-form-submit">{editing ? t("promoSave") : t("promoCreate")}</Button>
              </div>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>

      <PromoRedemptionsSheet key={redemptionsTarget?.id ?? "none"} promo={redemptionsTarget} onClose={() => setRedemptionsTarget(null)} />
      <PromoHistorySheet key={historyTarget?.id ?? "none"} promo={historyTarget} onClose={() => setHistoryTarget(null)} />

      <AlertDialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("promoDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("promoDeleteBody", { code: deleteTarget?.code })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction className={cn(buttonVariants({ variant: "destructive" }))} data-testid="promo-delete-confirm" onClick={() => { if (deleteTarget) deleteMut.mutate(deleteTarget); }}>
              {t("promoDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default AdminPromoCodes;
