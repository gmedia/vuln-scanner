import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, History, Loader2, Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import PageHeader from "@/components/layout/PageHeader";
import {
  AdminNotice,
  AdminShell,
  AdminShellBody,
  AdminShellHead,
} from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";
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
import { EmptyState } from "@/components/patterns/EmptyState";
import { listAdminInvoices } from "@/api/admin";
import {
  cancelAdminSubscription,
  getAdminSubscription,
  listAdminSubscriptions,
  recordAdminSubscriptionPayment,
  type AdminBillingStatus,
  type AdminSubscriptionItem,
} from "@/api/adminBilling";
import { TONE_TEXT } from "@/lib/toneColors";
import { cn, type ApiError } from "@/lib/utils";

const STATUSES: AdminBillingStatus[] = [
  "active",
  "past_due",
  "incomplete",
  "canceled",
];

function apiDetail(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const detail = (err as ApiError).response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

function formatIdr(value: number): string {
  return `Rp ${value.toLocaleString("id-ID")}`;
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusVariant(
  status: AdminBillingStatus,
): "success" | "pending" | "failed" | "info" | "default" {
  if (status === "active") return "success";
  if (status === "past_due") return "pending";
  if (status === "canceled") return "failed";
  if (status === "incomplete") return "info";
  return "default";
}

function AdminSubscriptions() {
  const { t, i18n } = useTranslation("admin");
  const dateLocale = i18n.language === "en" ? "en-US" : "id-ID";
  const qc = useQueryClient();

  const [status, setStatus] = useState<string>("all");
  const [paymentTarget, setPaymentTarget] = useState<AdminSubscriptionItem | null>(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [cancelTarget, setCancelTarget] = useState<AdminSubscriptionItem | null>(null);
  const [cancelMode, setCancelMode] = useState("period_end");
  const [cancelNote, setCancelNote] = useState("");
  const [historyTarget, setHistoryTarget] = useState<AdminSubscriptionItem | null>(null);

  const query = useQuery({
    queryKey: ["admin-subscriptions", status],
    queryFn: () =>
      listAdminSubscriptions({ status: status === "all" ? undefined : status }),
  });

  const invoicesQuery = useQuery({
    queryKey: ["admin-subscription-invoices", paymentTarget?.organization_id],
    queryFn: () =>
      listAdminInvoices({
        organization_id: paymentTarget!.organization_id,
        status: "sent",
      }),
    enabled: paymentTarget != null,
  });

  const historyQuery = useQuery({
    queryKey: ["admin-subscription-detail", historyTarget?.organization_id],
    queryFn: () => getAdminSubscription(historyTarget!.organization_id),
    enabled: historyTarget != null,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    void qc.invalidateQueries({ queryKey: ["admin-subscription-detail"] });
  };

  const payMut = useMutation({
    mutationFn: () =>
      recordAdminSubscriptionPayment(paymentTarget!.organization_id, {
        invoice_id: invoiceId,
        method,
        reference: reference.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(t("subscriptionRecordDone"));
      setPaymentTarget(null);
      setInvoiceId("");
      setReference("");
      invalidate();
    },
    onError: (err: unknown) => toast.error(apiDetail(err, t("subscriptionRecordFail"))),
  });

  const cancelMut = useMutation({
    mutationFn: () =>
      cancelAdminSubscription(cancelTarget!.organization_id, {
        at_period_end: cancelMode === "period_end",
        note: cancelNote.trim(),
      }),
    onSuccess: () => {
      toast.success(t("subscriptionCancelDone"));
      setCancelTarget(null);
      setCancelNote("");
      invalidate();
    },
    onError: (err: unknown) => toast.error(apiDetail(err, t("subscriptionCancelFail"))),
  });

  const items = query.data?.items ?? [];
  const invoices = invoicesQuery.data?.items ?? [];
  const busy = payMut.isPending || cancelMut.isPending;

  return (
    <div className="w-full space-y-6" data-testid="admin-subscriptions-page">
      <PageHeader
        leading={<CreditCard className="h-6 w-6 shrink-0 text-primary-text" />}
        title={t("subscriptionsTitle")}
        description={t("subscriptionsHint")}
      />

      <AdminShell tone="info" testid="admin-subscriptions-filter">
        <AdminShellBody>
          <div className="flex min-w-0 flex-col gap-1.5 sm:max-w-56">
            <Label htmlFor="admin-subscription-status">{t("subscriptionsFilter")}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="admin-subscription-status" className="h-10 min-h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("subscriptionsAll")}</SelectItem>
                {STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`subscriptionStatus_${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </AdminShellBody>
      </AdminShell>

      <AdminShell testid="admin-subscriptions-list">
        <AdminShellHead
          icon={CreditCard}
          title={t("subscriptionsTitle")}
          hint={t("subscriptionsHint")}
          aside={
            <Badge variant="info" className="font-mono text-[10px]">
              {query.data?.total ?? 0}
            </Badge>
          }
        />
        <AdminShellBody className="space-y-3">
          <AdminNotice tone="info" role="status">
            {t("subscriptionRecordHint")}
          </AdminNotice>

          {query.isLoading ? (
            <TableRowSkeleton rows={4} columns={5} />
          ) : query.isError ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="admin-subscriptions-error"
            >
              {t("subscriptionsLoadError")}
            </p>
          ) : items.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title={t("subscriptionsEmpty")}
              testId="admin-subscriptions-empty"
            />
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-md border border-border md:block">
                <Table data-testid="admin-subscriptions-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("subscriptionColOrg")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("subscriptionColPlan")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("subscriptionColStatus")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("subscriptionColPeriod")}
                      </TableHead>
                      <TableHead className="text-right text-[10px] uppercase tracking-wider">
                        {t("subscriptionColActions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id} data-testid={`admin-subscription-${item.id}`}>
                        <TableCell className="text-sm text-foreground">
                          {item.organization_name ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs uppercase text-foreground">
                          {item.sku} · {t(`subscriptionCycle_${item.cycle}`)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={statusVariant(item.status)}
                            data-status={item.status}
                            className="text-[10px] uppercase"
                          >
                            {t(`subscriptionStatus_${item.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                          {formatDate(item.current_period_start, dateLocale)} –{" "}
                          {formatDate(item.current_period_end, dateLocale)}
                          {item.cancel_at_period_end ? (
                            <span className={cn("block text-[10px]", TONE_TEXT.amber)}>
                              {t("subscriptionCancelScheduled", {
                                date: formatDate(item.current_period_end, dateLocale),
                              })}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setHistoryTarget(item)}
                              data-testid={`admin-subscription-history-${item.id}`}
                            >
                              <History className="mr-1 h-3.5 w-3.5" aria-hidden />
                              {t("subscriptionView")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={busy}
                              onClick={() => {
                                setPaymentTarget(item);
                                setInvoiceId("");
                                setReference("");
                                setMethod("bank_transfer");
                              }}
                              data-testid={`admin-subscription-pay-${item.id}`}
                            >
                              <Receipt className="mr-1 h-3.5 w-3.5" aria-hidden />
                              {t("subscriptionRecordPayment")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy || item.status === "canceled"}
                              onClick={() => {
                                setCancelTarget(item);
                                setCancelMode("period_end");
                                setCancelNote("");
                              }}
                              data-testid={`admin-subscription-cancel-${item.id}`}
                            >
                              {t("subscriptionCancelAction")}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2 md:hidden">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border bg-card p-3"
                    data-testid={`admin-subscription-mobile-${item.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium text-foreground">
                        {item.organization_name ?? "—"}
                      </p>
                      <Badge
                        variant={statusVariant(item.status)}
                        data-status={item.status}
                        className="shrink-0 text-[10px] uppercase"
                      >
                        {t(`subscriptionStatus_${item.status}`)}
                      </Badge>
                    </div>
                    <p className="mt-1 font-mono text-xs uppercase text-foreground">
                      {item.sku} · {t(`subscriptionCycle_${item.cycle}`)}
                    </p>
                    <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                      {formatDate(item.current_period_start, dateLocale)} –{" "}
                      {formatDate(item.current_period_end, dateLocale)}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-11"
                        disabled={busy}
                        onClick={() => {
                          setPaymentTarget(item);
                          setInvoiceId("");
                          setReference("");
                          setMethod("bank_transfer");
                        }}
                      >
                        {t("subscriptionRecordPayment")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        disabled={busy || item.status === "canceled"}
                        onClick={() => {
                          setCancelTarget(item);
                          setCancelMode("period_end");
                          setCancelNote("");
                        }}
                      >
                        {t("subscriptionCancelAction")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="col-span-2 min-h-11"
                        onClick={() => setHistoryTarget(item)}
                      >
                        {t("subscriptionView")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </AdminShellBody>
      </AdminShell>

      <AlertDialog
        open={paymentTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setPaymentTarget(null);
            setInvoiceId("");
            setReference("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("subscriptionRecordTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("subscriptionRecordHint")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="admin-subscription-invoice">
                {t("subscriptionRecordInvoice")}
              </Label>
              <Select value={invoiceId} onValueChange={setInvoiceId}>
                <SelectTrigger
                  id="admin-subscription-invoice"
                  className="h-10 min-h-10"
                  data-testid="admin-subscription-invoice-trigger"
                >
                  <SelectValue placeholder={t("subscriptionRecordInvoicePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map((invoice) => (
                    <SelectItem key={invoice.id} value={invoice.id}>
                      {invoice.number} · {formatIdr(invoice.amount_idr)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!invoicesQuery.isLoading && invoices.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {t("subscriptionRecordNoInvoices")}
                </p>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="admin-subscription-method">
                {t("subscriptionRecordMethod")}
              </Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="admin-subscription-method" className="h-10 min-h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">
                    {t("subscriptionMethod_bank_transfer")}
                  </SelectItem>
                  <SelectItem value="va">{t("subscriptionMethod_va")}</SelectItem>
                  <SelectItem value="qris">{t("subscriptionMethod_qris")}</SelectItem>
                  <SelectItem value="card">{t("subscriptionMethod_card")}</SelectItem>
                  <SelectItem value="manual">{t("subscriptionMethod_manual")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="admin-subscription-reference">
                {t("subscriptionRecordReference")}
              </Label>
              <Input
                id="admin-subscription-reference"
                value={reference}
                maxLength={128}
                placeholder={t("subscriptionRecordReferencePlaceholder")}
                onChange={(event) => setReference(event.target.value)}
                data-testid="admin-subscription-reference"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{t("subscriptionRequestCancel")}</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={payMut.isPending || !invoiceId}
              onClick={(event) => {
                event.preventDefault();
                payMut.mutate();
              }}
              data-testid="admin-subscription-pay-submit"
            >
              {payMut.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              {t("subscriptionRecordSubmit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={cancelTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
            setCancelNote("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("subscriptionCancelTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("subscriptionCancelBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="admin-subscription-cancel-mode">
                {t("subscriptionCancelBody")}
              </Label>
              <Select value={cancelMode} onValueChange={setCancelMode}>
                <SelectTrigger
                  id="admin-subscription-cancel-mode"
                  className="h-10 min-h-10"
                  data-testid="admin-subscription-cancel-mode"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="period_end">
                    {t("subscriptionCancelAtPeriodEnd", {
                      date: formatDate(cancelTarget?.current_period_end ?? null, dateLocale),
                    })}
                  </SelectItem>
                  <SelectItem value="now">{t("subscriptionCancelNow")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="admin-subscription-cancel-note">
                {t("subscriptionCancelNote")}
              </Label>
              <Textarea
                id="admin-subscription-cancel-note"
                value={cancelNote}
                maxLength={500}
                onChange={(event) => setCancelNote(event.target.value)}
                data-testid="admin-subscription-cancel-note"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{t("subscriptionRequestCancel")}</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={cancelMut.isPending}
              onClick={(event) => {
                event.preventDefault();
                cancelMut.mutate();
              }}
              data-testid="admin-subscription-cancel-submit"
            >
              {cancelMut.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              {t("subscriptionCancelSubmit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={historyTarget != null}
        onOpenChange={(open) => {
          if (!open) setHistoryTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("subscriptionDetailTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {historyTarget?.organization_name ?? "—"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div data-testid="admin-subscription-history">
            {historyQuery.isLoading ? (
              <div className="space-y-2">
                <div className="h-12 w-full animate-pulse rounded-md bg-muted" />
                <div className="h-12 w-full animate-pulse rounded-md bg-muted" />
              </div>
            ) : historyQuery.isError ? (
              <p className="text-sm text-muted-foreground">
                {t("subscriptionDetailLoadError")}
              </p>
            ) : (historyQuery.data?.attempts.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("subscriptionDetailEmpty")}
              </p>
            ) : (
              <ul className="space-y-2">
                {historyQuery.data!.attempts.map((attempt) => (
                  <li
                    key={attempt.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border p-2"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs tabular-nums text-foreground">
                        {formatDate(attempt.created_at, dateLocale)} ·{" "}
                        {formatIdr(attempt.amount_idr)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {attempt.method ?? attempt.provider}
                        {attempt.provider_ref ? ` · ${attempt.provider_ref}` : ""}
                      </p>
                    </div>
                    <Badge
                      variant={
                        attempt.status === "succeeded"
                          ? "success"
                          : attempt.status === "failed"
                            ? "failed"
                            : attempt.status === "expired"
                              ? "info"
                              : "pending"
                      }
                      className="shrink-0 text-[10px] uppercase"
                    >
                      {t(`subscriptionAttempt_${attempt.status}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{t("subscriptionRequestCancel")}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default AdminSubscriptions;
