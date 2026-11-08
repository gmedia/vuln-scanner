import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Download, Loader2, MoreHorizontal, Printer, Receipt, Info, Tag, Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { buttonVariants } from "@/components/ui/buttonVariants";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { DatePicker } from "@/components/ui/DatePicker";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
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
  Pagination,
  PaginationContent,
  PaginationItem,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AdminNotice,
  AdminShell,
  AdminShellBody,
  AdminShellHead,
} from "@/components/admin/AdminShell";
import {
  invoiceListTone,
  invoiceStatusTone,
} from "@/components/admin/adminChrome";
import { SiemRail } from "@/components/siem/siemChrome";
import { adminRailClass } from "@/components/admin/adminChrome";
import PageHeader from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/patterns/EmptyState";
import {
  adminApi,
  downloadAdminInvoicePdf,
  type AdminOrgItem,
  type InvoiceItem,
  type InvoiceProduct,
  type PromoValidateResult,
} from "@/api/admin";
import {
  listAdminSubscriptionRequests,
  type SubscriptionRequestItem,
} from "@/api/subscription";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  InvoicePrintSheet,
  useInvoicePrint,
} from "@/components/invoice/InvoicePrintSheet";
import { useTierMap } from "@/hooks/useTierMap";
import { apiErrorMessage } from "@/api/apiErrors";

function formatIdr(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

const STALE_DRAFT_DAYS = 7;

function isStaleDraft(inv: InvoiceItem): boolean {
  if (inv.status !== "draft") return false;
  const created = Date.parse(inv.created_at);
  if (Number.isNaN(created)) return false;
  return Date.now() - created >= STALE_DRAFT_DAYS * 24 * 60 * 60 * 1000;
}

function isInvoiceProduct(value: string): value is InvoiceProduct {
  return value === "scan" || value === "host" || value === "uptime" || value === "guard";
}

const PAGE_SIZE = 20;
const ORG_SEARCH_DEBOUNCE_MS = 300;

function Pager({
  page,
  total,
  onPage,
  testId,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
  testId: string;
}) {
  const { t } = useTranslation("admin");
  if (total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = Math.min((page - 1) * PAGE_SIZE + 1, total);
  const to = Math.min(page * PAGE_SIZE, total);
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
      <p
        className="font-mono text-xs tabular-nums text-muted-foreground"
        data-testid={`${testId}-range`}
      >
        {t("showingRange", { from, to, total })}
      </p>
      {totalPages > 1 ? (
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                data-testid={`${testId}-prev`}
                onClick={() => onPage(Math.max(1, page - 1))}
                disabled={page <= 1}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="px-2 font-mono text-xs tabular-nums text-muted-foreground">
                {t("pageOf", { page, total: totalPages })}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                data-testid={`${testId}-next`}
                onClick={() => onPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  );
}


function AdminInvoices() {
  const { t } = useTranslation("admin");
  const { label: tierLabel } = useTierMap();
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [orgSearch, setOrgSearch] = useState("");
  const [debouncedOrgSearch, setDebouncedOrgSearch] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<AdminOrgItem | null>(null);
  const [voidTarget, setVoidTarget] = useState<InvoiceItem | null>(null);
  const [payTarget, setPayTarget] = useState<InvoiceItem | null>(null);
  const [payRef, setPayRef] = useState("");
  const [orgId, setOrgId] = useState("");
  const [product, setProduct] = useState<InvoiceProduct>("scan");
  const [sku, setSku] = useState("");
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [periodStart, setPeriodStart] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoResult, setPromoResult] = useState<PromoValidateResult | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoLinkError, setPromoLinkError] = useState<string | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [requestId, setRequestId] = useState("");
  const { printing, startPrint } = useInvoicePrint();

  const catalogQ = useQuery({
    queryKey: ["admin-sku-catalog"],
    queryFn: adminApi.getSkuCatalog,
  });
  const orgsQ = useQuery({
    queryKey: ["admin-orgs", debouncedOrgSearch],
    queryFn: () =>
      adminApi.listAdminOrgs({
        q: debouncedOrgSearch || undefined,
        page_size: 50,
      }),
  });
  useEffect(() => {
    const handle = setTimeout(
      () => setDebouncedOrgSearch(orgSearch.trim()),
      ORG_SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(handle);
  }, [orgSearch]);
  const pendingRequestsQuery = useQuery({
    queryKey: ["admin-subscription-requests", "pending", 100],
    queryFn: () =>
      listAdminSubscriptionRequests({
        status: "pending",
        page: 1,
        page_size: 100,
      }),
    retry: false,
  });
  const invoicesQ = useQuery({
    queryKey: ["admin-invoices", status, page],
    queryFn: () =>
      adminApi.listAdminInvoices({
        status: status === "all" ? undefined : status,
        page,
        page_size: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const catalog = catalogQ.data ?? [];
  const orgs = orgsQ.data?.items ?? [];
  const orgOptions =
    selectedOrg && !orgs.some((org) => org.id === selectedOrg.id)
      ? [selectedOrg, ...orgs]
      : orgs;
  const invoices = invoicesQ.data?.items ?? [];
  const invoicableProducts = catalog
    .filter((row) => row.invoicable && row.active !== false)
    .reduce<InvoiceProduct[]>((acc, row) => {
      if (!acc.includes(row.product)) acc.push(row.product);
      return acc;
    }, []);
  const skuOptions = catalog.filter(
    (row) => row.product === product && row.invoicable && row.active !== false,
  );
  const skuValue = skuOptions.some((row) => row.sku === sku)
    ? sku
    : (skuOptions[0]?.sku ?? "");
  const pendingForOrg = (pendingRequestsQuery.data?.items ?? []).filter(
    (r) => r.organization_id === orgId && r.status === "pending",
  );
  const linkedRequest = pendingForOrg.find((r) => r.id === requestId);
  const promoHintRequest =
    linkedRequest?.promo_code
      ? linkedRequest
      : pendingForOrg.length === 1 && pendingForOrg[0].promo_code
        ? pendingForOrg[0]
        : undefined;

  function clearPromo() {
    setPromoCode("");
    setPromoResult(null);
    setPromoError(null);
  }

  function clearRequest() {
    setRequestId("");
    setPromoLinkError(null);
  }

  async function validateLinkedPromo(
    code: string,
    targetSku: string,
    targetCycle: "monthly" | "annual",
  ) {
    if (!orgId) return;
    setPromoLoading(true);
    setPromoLinkError(null);
    setPromoError(null);
    setPromoResult(null);
    try {
      const result = await adminApi.validateAdminPromoCode({
        organization_id: orgId,
        code: code.trim().toUpperCase(),
        product,
        sku: targetSku,
        cycle: targetCycle,
      });
      setPromoResult(result);
    } catch (err) {
      setPromoLinkError(apiErrorMessage(err, t("invoiceRequestPromoInvalid")));
    } finally {
      setPromoLoading(false);
    }
  }

  function applyRequest(req: SubscriptionRequestItem) {
    setRequestId(req.id);
    // Plan requests are scan-only; never consume one against a host/uptime line.
    setProduct("scan");
    setSku(req.target_sku);
    setCycle(req.cycle);
    setPromoLinkError(null);
    if (req.promo_code) {
      setPromoCode(req.promo_code.toUpperCase());
      setPromoResult(null);
      setPromoError(null);
      void validateLinkedPromo(req.promo_code, req.target_sku, req.cycle);
    } else {
      clearPromo();
    }
  }

  function onRequestChange(value: string) {
    if (value === "none") {
      clearRequest();
      return;
    }
    const req = pendingForOrg.find((r) => r.id === value);
    if (req) applyRequest(req);
  }

  async function applyPromo() {
    if (!orgId || !skuValue || !promoCode.trim()) return;
    setPromoLoading(true);
    setPromoError(null);
    setPromoResult(null);
    try {
      const result = await adminApi.validateAdminPromoCode({
        organization_id: orgId,
        code: promoCode.trim().toUpperCase(),
        product,
        sku: skuValue,
        cycle,
      });
      setPromoResult(result);
    } catch (err) {
      setPromoError(apiErrorMessage(err, t("invoicePromoInvalid")));
    } finally {
      setPromoLoading(false);
    }
  }

  function onProductChange(value: string) {
    if (!isInvoiceProduct(value)) return;
    setProduct(value);
    clearPromo();
    clearRequest();
    const nextSkus = catalog.filter(
      (row) => row.product === value && row.invoicable && row.active !== false,
    );
    if (!nextSkus.some((row) => row.sku === sku)) {
      setSku(nextSkus[0]?.sku ?? "");
    }
  }

  const createMut = useMutation({
    mutationFn: () =>
      adminApi.createAdminInvoice({
        organization_id: orgId,
        sku: skuValue,
        product,
        cycle,
        ...(periodStart ? { period_start: periodStart } : {}),
        ...(dueDate ? { due_date: dueDate } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(promoResult
          ? { promo_code: promoCode.trim().toUpperCase() }
          : {}),
        ...(requestId ? { subscription_request_id: requestId } : {}),
      }),
    onSuccess: () => {
      toast.success(t("invoiceCreated"));
      setPeriodStart("");
      setDueDate("");
      setNotes("");
      clearPromo();
      clearRequest();
      void qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      void qc.invalidateQueries({
        queryKey: ["admin-subscription-requests"],
      });
    },
    onError: (err: unknown) =>
      toast.error(apiErrorMessage(err, t("invoiceCreateFail"))),
  });
  const sendMut = useMutation({
    mutationFn: (id: string) => adminApi.sendAdminInvoice(id),
    onSuccess: () => {
      toast.success(t("invoiceSent"));
      void qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, t("invoiceSendFail"))),
  });
  const payMut = useMutation({
    mutationFn: ({ id, bankRef }: { id: string; bankRef?: string }) =>
      adminApi.payAdminInvoice(id, bankRef),
    onSuccess: (inv) => {
      toast.success(
        t(`invoicePaid_${inv.product}`, { defaultValue: t("invoicePaid") }),
      );
      setPayTarget(null);
      setPayRef("");
      void qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, t("invoicePayFail"))),
  });
  const voidMut = useMutation({
    mutationFn: (id: string) => adminApi.voidAdminInvoice(id),
    onSuccess: () => {
      toast.success(t("invoiceVoided"));
      void qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, t("invoiceVoidFail"))),
  });

  async function downloadPdf(inv: InvoiceItem) {
    try {
      await downloadAdminInvoicePdf(inv.id, inv.number);
    } catch {
      toast.error(t("invoicePdfFail"));
    }
  }

  return (
    <div className="w-full space-y-6" data-testid="admin-invoices-page">
      <PageHeader
        leading={<Receipt className="h-6 w-6 shrink-0 text-primary-text" />}
        title={t("invoicesTitle")}
      />

      <AdminShell testid="invoices-guide" tone="info">
        <AdminShellHead
          icon={BookOpen}
          title={t("invGuideTitle")}
          hint={t("invGuideHint")}
        />
        <AdminShellBody>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="steps">
              <AccordionTrigger>{t("invGuideStepsTitle")}</AccordionTrigger>
              <AccordionContent>
                <ol className="ml-4 list-decimal space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <li>{t("invGuideStep1")}</li>
                  <li>{t("invGuideStep2")}</li>
                  <li>{t("invGuideStep3")}</li>
                  <li>{t("invGuideStep4")}</li>
                  <li>{t("invGuideStep5")}</li>
                  <li>{t("invGuideStep6")}</li>
                </ol>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="payment">
              <AccordionTrigger>{t("invGuidePaymentTitle")}</AccordionTrigger>
              <AccordionContent>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("invGuidePaymentBody")}
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="discount">
              <AccordionTrigger>{t("invGuideDiscountTitle")}</AccordionTrigger>
              <AccordionContent>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("invGuideDiscountBody")}
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="limits">
              <AccordionTrigger>{t("invGuideLimitsTitle")}</AccordionTrigger>
              <AccordionContent>
                <ul className="ml-4 list-disc space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <li>{t("invGuideLimit1")}</li>
                  <li>{t("invGuideLimit2")}</li>
                  <li>{t("invGuideLimit3")}</li>
                  <li>{t("invGuideLimit4")}</li>
                  <li>{t("invGuideLimit5")}</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </AdminShellBody>
      </AdminShell>

      <AdminShell tone="info" testid="invoices-banner">
        <AdminShellHead icon={Info} title={t("invoicesBannerTitle")} />
        <AdminShellBody>
          <p className="max-w-prose text-xs text-muted-foreground">
            {t("invoicesBannerBody")}
          </p>
        </AdminShellBody>
      </AdminShell>

      <AdminShell tone="primary">
        <AdminShellHead icon={Tag} title={t("skuCatalogCard")} />
        <AdminShellBody>
          {catalogQ.isLoading ? (
            <TableRowSkeleton rows={3} columns={5} />
          ) : (
            <>
              <div
                className="space-y-2 md:hidden"
                data-testid="invoice-catalog-mobile"
              >
                {catalog.map((row) => (
                  <div
                    key={`${row.product}-${row.sku}`}
                    className="relative w-full overflow-hidden rounded-lg border border-border bg-card p-3 pl-4 text-left"
                  >
                    <SiemRail className={adminRailClass("primary")} />
                    <p className="text-sm text-foreground">{row.product}</p>
                    <p className="text-xs text-foreground">
                      {row.label || row.sku}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatIdr(row.list_idr)} · {row.seats} {t("colSeats")} ·{" "}
                      {t("colInvoicable")} {row.invoicable ? t("yes") : t("no")}
                    </p>
                  </div>
                ))}
              </div>
              <div
                className="hidden overflow-hidden rounded-md border border-border md:block"
                data-testid="invoice-catalog-desktop"
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colProduct")}</TableHead>
                      <TableHead>{t("colSku")}</TableHead>
                      <TableHead>{t("colListPrice")}</TableHead>
                      <TableHead>{t("colSeats")}</TableHead>
                      <TableHead>{t("colInvoicable")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalog.map((row) => (
                      <TableRow key={`${row.product}-${row.sku}`} className="hover:bg-muted/50">
                        <TableCell>{row.product}</TableCell>
                        <TableCell>{row.label || row.sku}</TableCell>
                        <TableCell className="font-mono tabular-nums">
                          {formatIdr(row.list_idr)}
                        </TableCell>
                        <TableCell>{row.seats}</TableCell>
                        <TableCell>{row.invoicable ? t("yes") : t("no")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </AdminShellBody>
      </AdminShell>

      <AdminShell tone="primary">
        <AdminShellHead icon={Plus} title={t("invoiceCreateCard")} />
        <AdminShellBody className="space-y-3">
          <div className="grid gap-3 sm:max-w-md">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="inv-org-search">{t("invoiceOrgSearchLabel")}</Label>
              <Input
                id="inv-org-search"
                type="search"
                className="h-10 min-h-10"
                placeholder={t("invoiceOrgSearchPlaceholder")}
                value={orgSearch}
                onChange={(event) => setOrgSearch(event.target.value)}
                data-testid="invoice-org-search"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-5">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="inv-org">{t("colOrg")}</Label>
              <Select
                value={orgId}
                onValueChange={(value) => {
                  setOrgId(value);
                  setSelectedOrg(
                    orgOptions.find((org) => org.id === value) ?? null,
                  );
                  clearPromo();
                  clearRequest();
                }}
              >
                <SelectTrigger id="inv-org" className="h-10 min-h-10">
                  <SelectValue placeholder={t("pickOrg")} />
                </SelectTrigger>
                <SelectContent>
                  {orgOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name} ({o.sku_label ?? tierLabel(o.sku)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="inv-product">{t("colProduct")}</Label>
              <Select value={product} onValueChange={onProductChange}>
                <SelectTrigger
                  id="inv-product"
                  className="h-10 min-h-10"
                  data-testid="invoice-product"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {invoicableProducts.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="inv-sku">{t("colSku")}</Label>
              <Select
                value={skuValue}
                onValueChange={(value) => {
                  setSku(value);
                  clearPromo();
                  clearRequest();
                }}
                disabled={skuOptions.length === 0}
              >
                <SelectTrigger
                  id="inv-sku"
                  className="h-10 min-h-10"
                  data-testid="invoice-sku"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {skuOptions.map((row) => (
                    <SelectItem key={row.sku} value={row.sku}>
                      {row.label || row.sku}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="inv-cycle">{t("invoiceCycle")}</Label>
              <Select
                value={cycle}
                onValueChange={(value) => {
                  setCycle(value === "annual" ? "annual" : "monthly");
                  clearPromo();
                  clearRequest();
                }}
              >
                <SelectTrigger
                  id="inv-cycle"
                  className="h-10 min-h-10"
                  data-testid="invoice-cycle"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t("invoiceCycleMonthly")}</SelectItem>
                  <SelectItem value="annual">{t("invoiceCycleAnnual")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                data-testid="invoice-create"
                className="min-h-11 w-full sm:min-h-10 sm:w-auto"
                disabled={!orgId || !skuValue || createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                {createMut.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t("invoiceCreate")}
              </Button>
            </div>
          </div>
          {product !== "scan" ? (
            <AdminNotice tone="info" role="status">
              <span data-testid="invoice-nonscan-notice">
                {t("invoiceNonScanNotice")}
              </span>
            </AdminNotice>
          ) : null}
          <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="inv-period-start">{t("invoicePeriodStart")}</Label>
              <DatePicker
                id="inv-period-start"
                value={periodStart}
                onChange={setPeriodStart}
                placeholder={t("invoicePeriodStartPlaceholder")}
                aria-label={t("invoicePeriodStart")}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="inv-due-date">{t("invoiceDueDate")}</Label>
              <DatePicker
                id="inv-due-date"
                value={dueDate}
                onChange={setDueDate}
                placeholder={t("invoiceDueDatePlaceholder")}
                aria-label={t("invoiceDueDate")}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="inv-notes">{t("invoiceNotesLabel")}</Label>
              <Textarea
                id="inv-notes"
                value={notes}
                maxLength={500}
                placeholder={t("invoiceNotesPlaceholder")}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2 border-t border-border pt-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="inv-request">{t("invoiceRequestLabel")}</Label>
                <Select
                  value={requestId || "none"}
                  onValueChange={onRequestChange}
                  disabled={
                    !orgId ||
                    pendingRequestsQuery.isLoading ||
                    pendingForOrg.length === 0
                  }
                >
                  <SelectTrigger
                    id="inv-request"
                    className="h-10 min-h-10"
                    data-testid="invoice-request"
                  >
                    <SelectValue placeholder={t("invoiceRequestNone")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {t("invoiceRequestNone")}
                    </SelectItem>
                    {pendingForOrg.map((req) => (
                      <SelectItem key={req.id} value={req.id}>
                        {`#${req.id.slice(0, 8)} · ${req.target_sku} · ${req.cycle}${
                          req.promo_code ? ` · ${req.promo_code}` : ""
                        }`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex min-w-0 flex-col justify-end text-xs sm:col-span-2">
                {!orgId ? null : pendingRequestsQuery.isLoading ? null : pendingForOrg.length === 0 ? (
                  <p
                    className="text-[11px] text-muted-foreground"
                    data-testid="invoice-request-empty"
                  >
                    {t("invoiceRequestEmpty")}
                  </p>
                ) : promoHintRequest && !promoCode ? (
                  <p
                    className="text-[11px] text-muted-foreground"
                    data-testid="invoice-request-promo-hint"
                  >
                    {t("invoiceRequestPromoHint", {
                      code: promoHintRequest.promo_code,
                    })}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    {t("invoiceRequestHint")}
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="inv-promo">{t("invoicePromoLabel")}</Label>
                <Input
                  id="inv-promo"
                  className="h-10 min-h-10 font-mono uppercase"
                  value={promoCode}
                  placeholder="LAUNCH2026"
                  disabled={promoLoading || cycle === "annual"}
                  onChange={(event) => {
                    setPromoCode(event.target.value.toUpperCase());
                    setPromoResult(null);
                    setPromoError(null);
                    clearRequest();
                  }}
                  data-testid="invoice-promo-code"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full sm:min-h-10 sm:w-auto"
                  disabled={
                    !orgId ||
                    !skuValue ||
                    cycle === "annual" ||
                    promoLoading ||
                    !promoCode.trim()
                  }
                  onClick={() => void applyPromo()}
                  data-testid="invoice-promo-apply"
                >
                  {promoLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("promoApply")}
                </Button>
              </div>
              <div className="flex min-w-0 flex-col justify-end text-xs">
                {cycle === "annual" ? (
                  <p className="text-[11px] text-muted-foreground">
                    {t("invoicePromoAnnual")}
                  </p>
                ) : promoResult ? (
                  <div data-testid="invoice-promo-result">
                    <p className="text-foreground">
                      {promoResult.description || t("invoicePromoLabel")}
                    </p>
                    <p className="font-mono tabular-nums text-muted-foreground">
                      {t("invoiceDiscount")}:{" "}
                      {formatIdr(promoResult.discount_idr)} ·{" "}
                      {t("invoiceTotal")}: {formatIdr(promoResult.total_idr)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t("invoicePromoEstimate")}
                    </p>
                  </div>
                ) : promoLinkError ? (
                  <p
                    className="text-[11px] text-destructive"
                    data-testid="invoice-request-promo-invalid"
                  >
                    {promoLinkError}
                  </p>
                ) : promoError ? (
                  <p
                    className="text-[11px] text-destructive"
                    data-testid="invoice-promo-error"
                  >
                    {promoError}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </AdminShellBody>
      </AdminShell>

      <AdminShell
        tone={invoiceListTone(invoices.map((i) => i.status))}
        testid="invoices-list-shell"
      >
        <AdminShellHead icon={FileText} title={t("invoiceListCard")} />
        <AdminShellBody className="space-y-3">
          <div className="grid gap-3 sm:max-w-xs">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="inv-status">{t("colStatus")}</Label>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value);
                  setPage(1);
                }}
              >
                <SelectTrigger id="inv-status" className="h-10 min-h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("statusAll")}</SelectItem>
                  <SelectItem value="draft">draft</SelectItem>
                  <SelectItem value="sent">sent</SelectItem>
                  <SelectItem value="paid">paid</SelectItem>
                  <SelectItem value="void">void</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {invoicesQ.isLoading ? (
            <TableRowSkeleton rows={4} columns={7} />
          ) : invoices.length === 0 ? (
            <EmptyState
              testId="admin-invoices-empty"
              icon={Receipt}
              title={t("invoicesEmpty")}
            />
          ) : (
            <>
              <div
                className="space-y-2 md:hidden"
                data-testid="invoices-list-mobile"
              >
                {invoices.map((inv: InvoiceItem) => (
                  <div
                    key={inv.id}
                    className="relative w-full overflow-hidden rounded-lg border border-border bg-card p-3 pl-4 text-left"
                  >
                    <SiemRail
                      className={adminRailClass(invoiceStatusTone(inv.status))}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-xs text-foreground">
                        {inv.number}
                      </p>
                      <Badge variant="default">{inv.status}</Badge>
                      {inv.product !== "scan" ? (
                        <Badge
                          variant="info"
                          title={t("invoiceNonScanMarker")}
                          data-testid={`invoice-nonscan-badge-${inv.id}`}
                        >
                          {inv.product}
                        </Badge>
                      ) : null}
                      {isStaleDraft(inv) ? (
                        <Badge
                          variant="pending"
                          title={t("invoiceStaleDraftHint")}
                          data-testid={`invoice-stale-draft-${inv.id}`}
                        >
                          {t("invoiceStaleDraft")}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-foreground">
                      {inv.organization_name ?? "—"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {inv.product} · {tierLabel(inv.sku)} ·{" "}
                      {formatIdr(inv.total_idr ?? inv.amount_idr)}
                    </p>
                    {(inv.discount_idr ?? 0) > 0 ? (
                      <p
                        className="mt-1 text-[11px] text-muted-foreground"
                        data-testid={`invoice-discount-${inv.id}`}
                      >
                        {t("invoiceDiscount")}
                        {inv.promo_code ? ` (${inv.promo_code})` : ""}:{" "}
                        {formatIdr(inv.discount_idr ?? 0)}
                      </p>
                    ) : null}
                    <div className="mt-3 flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-11 w-11 min-h-11 min-w-11 p-0 md:h-9 md:w-9 md:min-h-9 md:min-w-9"
                            data-testid={`invoice-actions-${inv.id}`}
                            aria-label={t("actionsMenu")}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {inv.status === "sent" || inv.status === "paid" ? (
                            <DropdownMenuItem
                              className="no-print"
                              data-testid="admin-invoice-print-m"
                              onSelect={() => startPrint(inv)}
                            >
                              <Printer className="mr-2 h-4 w-4" />
                              {t("invoicePrint")}
                            </DropdownMenuItem>
                          ) : null}
                          {inv.status === "sent" || inv.status === "paid" ? (
                            <DropdownMenuItem
                              className="no-print"
                              data-testid="admin-invoice-pdf-m"
                              onSelect={() => void downloadPdf(inv)}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              {t("invoicePdf")}
                            </DropdownMenuItem>
                          ) : null}
                          {inv.status === "draft" ? (
                            <DropdownMenuItem
                              data-testid={`invoice-send-m-${inv.id}`}
                              onSelect={() => sendMut.mutate(inv.id)}
                            >
                              {t("invoiceSend")}
                            </DropdownMenuItem>
                          ) : null}
                          {inv.status === "draft" || inv.status === "sent" ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                data-testid={`invoice-paid-m-${inv.id}`}
                                onSelect={() => {
                                  setPayRef("");
                                  setPayTarget(inv);
                                }}
                              >
                                {t("invoiceMarkPaid")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                data-testid={`invoice-void-m-${inv.id}`}
                                onSelect={() => setVoidTarget(inv)}
                              >
                                {t("invoiceVoid")}
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
              <div
                className="hidden overflow-hidden rounded-md border border-border md:block"
                data-testid="invoices-list-desktop"
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colNumber")}</TableHead>
                      <TableHead>{t("colOrg")}</TableHead>
                      <TableHead>{t("colProduct")}</TableHead>
                      <TableHead>{t("colSku")}</TableHead>
                      <TableHead>{t("colListIdr")}</TableHead>
                      <TableHead>{t("invoiceDiscount")}</TableHead>
                      <TableHead>{t("colStatus")}</TableHead>
                      <TableHead className="text-right">
                        {t("colActions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                <TableBody>
                  {invoices.map((inv: InvoiceItem) => (
                    <TableRow key={inv.id} className="hover:bg-muted/50">
                      <TableCell className="relative pl-4 font-mono text-xs">
                        <SiemRail
                          className={adminRailClass(invoiceStatusTone(inv.status))}
                        />
                        {inv.number}
                      </TableCell>
                      <TableCell>{inv.organization_name ?? "—"}</TableCell>
                      <TableCell>
                        {inv.product === "scan" ? (
                          inv.product
                        ) : (
                          <Badge
                            variant="info"
                            title={t("invoiceNonScanMarker")}
                            data-testid={`invoice-nonscan-badge-${inv.id}`}
                          >
                            {inv.product}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{tierLabel(inv.sku)}</TableCell>
                      <TableCell className="font-mono tabular-nums">
                        {formatIdr(inv.total_idr ?? inv.amount_idr)}
                      </TableCell>
                      <TableCell
                        className="font-mono text-xs tabular-nums text-muted-foreground"
                        data-testid={`invoice-discount-desktop-${inv.id}`}
                      >
                        {(inv.discount_idr ?? 0) > 0
                          ? `${formatIdr(inv.discount_idr ?? 0)}${inv.promo_code ? ` (${inv.promo_code})` : ""}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">{inv.status}</Badge>
                      {isStaleDraft(inv) ? (
                        <Badge
                          variant="pending"
                          title={t("invoiceStaleDraftHint")}
                          data-testid={`invoice-stale-draft-${inv.id}`}
                        >
                          {t("invoiceStaleDraft")}
                        </Badge>
                      ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-9 w-9 p-0"
                                data-testid={`invoice-actions-${inv.id}`}
                                aria-label={t("actionsMenu")}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {inv.status === "sent" || inv.status === "paid" ? (
                                <DropdownMenuItem
                                  className="no-print"
                                  data-testid="admin-invoice-print"
                                  onSelect={() => startPrint(inv)}
                                >
                                  <Printer className="mr-2 h-4 w-4" />
                                  {t("invoicePrint")}
                                </DropdownMenuItem>
                              ) : null}
                              {inv.status === "sent" || inv.status === "paid" ? (
                                <DropdownMenuItem
                                  className="no-print"
                                  data-testid="admin-invoice-pdf"
                                  onSelect={() => void downloadPdf(inv)}
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  {t("invoicePdf")}
                                </DropdownMenuItem>
                              ) : null}
                              {inv.status === "draft" ? (
                                <DropdownMenuItem
                                  data-testid={`invoice-send-${inv.id}`}
                                  onSelect={() => sendMut.mutate(inv.id)}
                                >
                                  {t("invoiceSend")}
                                </DropdownMenuItem>
                              ) : null}
                              {inv.status === "draft" || inv.status === "sent" ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    data-testid={`invoice-paid-${inv.id}`}
                                    onSelect={() => {
                                      setPayRef("");
                                      setPayTarget(inv);
                                    }}
                                  >
                                    {t("invoiceMarkPaid")}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    data-testid={`invoice-void-${inv.id}`}
                                    onSelect={() => setVoidTarget(inv)}
                                  >
                                    {t("invoiceVoid")}
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  </TableBody>
                </Table>
              </div>
              <AlertDialog
                open={!!voidTarget}
                onOpenChange={(open) => {
                  if (!open) setVoidTarget(null);
                }}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("invoiceVoidConfirmTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("invoiceVoidConfirmBody")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      className={buttonVariants({ variant: "destructive" })}
                      data-testid="invoice-void-confirm"
                      onClick={() => {
                        if (voidTarget) voidMut.mutate(voidTarget.id);
                        setVoidTarget(null);
                      }}
                    >
                      {t("invoiceVoid")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog
                open={!!payTarget}
                onOpenChange={(open) => {
                  if (!open) {
                    setPayTarget(null);
                    setPayRef("");
                  }
                }}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("invoicePayTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("invoicePayBody", { number: payTarget?.number ?? "" })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-3">
                    <div className="rounded-md border border-border bg-muted/40 p-3">
                      <p className="text-sm text-foreground">
                        {payTarget?.organization_name ?? "—"}
                      </p>
                      <p className="mt-1 font-mono tabular-nums text-foreground">
                        {payTarget
                          ? formatIdr(payTarget.total_idr ?? payTarget.amount_idr)
                          : ""}
                      </p>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <Label htmlFor="invoice-pay-ref">
                        {t("invoicePayRefLabel")}
                      </Label>
                      <Input
                        id="invoice-pay-ref"
                        className="h-10 min-h-10"
                        value={payRef}
                        maxLength={64}
                        placeholder="TF-…"
                        onChange={(e) => setPayRef(e.target.value)}
                        data-testid="invoice-pay-ref"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {t("invoicePayRefHint")}
                      </p>
                    </div>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      data-testid="invoice-pay-confirm"
                      disabled={payMut.isPending}
                      onClick={() => {
                        if (!payTarget) return;
                        payMut.mutate({
                          id: payTarget.id,
                          bankRef: payRef.trim() || undefined,
                        });
                      }}
                    >
                      {t("invoicePayConfirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          <Pager
            page={page}
            total={invoicesQ.data?.total ?? 0}
            onPage={setPage}
            testId="invoices"
          />
        </AdminShellBody>
      </AdminShell>
      <InvoicePrintSheet
        invoice={printing}
        skuLabel={printing ? tierLabel(printing.sku) : undefined}
      />
    </div>
  );
}

export default AdminInvoices;
