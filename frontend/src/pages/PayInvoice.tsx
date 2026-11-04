import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import {
  CheckCircle2,
  Copy,
  Landmark,
  Loader2,
  Receipt,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import PageHeader from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  WorkspaceNotice,
  WorkspaceShell,
  WorkspaceShellBody,
  WorkspaceShellHead,
} from "@/components/workspace/WorkspaceShell";
import { apiDetail } from "@/components/siem/siemErrors";
import { formatIdr } from "@/components/invoice/invoicePrintFormat";
import {
  checkoutInvoice,
  getInvoice,
  listPaymentProviders,
  type PayableInvoice,
} from "@/api/orgs";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 60_000;

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function payTone(status: string): "primary" | "success" | "danger" | "idle" {
  if (status === "paid") return "success";
  if (status === "void") return "danger";
  if (status === "sent") return "primary";
  return "idle";
}

function statusVariant(
  status: string,
): "success" | "pending" | "failed" | "info" {
  if (status === "paid") return "success";
  if (status === "sent") return "pending";
  if (status === "void") return "failed";
  return "info";
}

function Breakdown({ invoice }: { readonly invoice: PayableInvoice }) {
  const { t } = useTranslation("subscription");
  const total = invoice.total_idr ?? invoice.amount_idr;
  const discount = invoice.discount_idr ?? 0;
  const dpp = invoice.dpp_idr ?? 0;
  const ppn = invoice.ppn_idr ?? 0;

  return (
    <dl className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
      {invoice.amount_idr > 0 ? (
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{t("pay.subtotal")}</dt>
          <dd className="font-mono tabular-nums text-foreground">
            {formatIdr(invoice.amount_idr)}
          </dd>
        </div>
      ) : null}
      {discount > 0 ? (
        <div
          className="flex items-baseline justify-between gap-3"
          data-testid="pay-invoice-discount"
        >
          <dt className="text-muted-foreground">
            {t("pay.discount")}
            {invoice.promo_code ? (
              <span className="ml-1 font-mono text-xs text-foreground">
                {invoice.promo_code}
              </span>
            ) : null}
          </dt>
          <dd className="font-mono tabular-nums text-primary-text">
            −{formatIdr(discount)}
          </dd>
        </div>
      ) : null}
      {dpp > 0 ? (
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{t("pay.dpp")}</dt>
          <dd className="font-mono tabular-nums text-foreground">
            {formatIdr(dpp)}
          </dd>
        </div>
      ) : null}
      {ppn > 0 ? (
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{t("pay.ppn")}</dt>
          <dd className="font-mono tabular-nums text-foreground">
            {formatIdr(ppn)}
          </dd>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
        <dt className="font-medium text-foreground">{t("pay.total")}</dt>
        <dd
          className="font-mono text-lg font-semibold tabular-nums text-foreground"
          data-testid="pay-invoice-total"
        >
          {formatIdr(total)}
        </dd>
      </div>
    </dl>
  );
}

function InvoiceMeta({ invoice }: { readonly invoice: PayableInvoice }) {
  const { t, i18n } = useTranslation("subscription");
  const locale = i18n.language === "en" ? "en-US" : "id-ID";
  const period = `${formatDate(invoice.period_start, locale)} – ${formatDate(invoice.period_end, locale)}`;
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">
          {t("pay.invoiceNumber")}:
        </span>{" "}
        <span className="font-mono">{invoice.number}</span>
      </p>
      <p>
        <span className="font-medium text-foreground">{t("pay.period")}:</span>{" "}
        {period}
      </p>
      {invoice.due_date ? (
        <p>
          <span className="font-medium text-foreground">
            {t("pay.dueDate")}:
          </span>{" "}
          {formatDate(invoice.due_date, locale)}
        </p>
      ) : null}
    </div>
  );
}

function PayInvoice() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const [searchParams] = useSearchParams();
  const returnStatus = searchParams.get("status");
  const { t, i18n } = useTranslation("subscription");
  const locale = i18n.language === "en" ? "en-US" : "id-ID";
  const invoiceQuery = useQuery({
    queryKey: ["pay-invoice", invoiceId],
    queryFn: () => getInvoice(invoiceId!),
    enabled: !!invoiceId,
    retry: false,
  });

  const providersQuery = useQuery({
    queryKey: ["payment-providers"],
    queryFn: listPaymentProviders,
    enabled: true,
    retry: false,
  });

  const providerItems = providersQuery.data?.items;
  const providers = useMemo(() => providerItems ?? [], [providerItems]);
  const [provider, setProvider] = useState("");
  const [pollRun, setPollRun] = useState(0);
  const [pollExpired, setPollExpired] = useState(false);
  const pollStarted = useRef<number | null>(null);

  const invoice = invoiceQuery.data;
  const total = invoice ? (invoice.total_idr ?? invoice.amount_idr) : 0;
  const payable = !!invoice && invoice.status === "sent" && total > 0;
  const selectedProvider = useMemo(
    () => providers.find((item) => item.name === provider) ?? providers[0],
    [provider, providers],
  );

  const checkoutMut = useMutation({
    mutationFn: (providerName: string) => {
      if (!invoice) throw new Error("invoice_not_loaded");
      return checkoutInvoice(invoice.organization_id, invoice.id, providerName);
    },
    onSuccess: (result) => {
      window.location.assign(result.redirect_url);
    },
    onError: (err: unknown) => {
      toast.error(apiDetail(err, t("pay.payFail")));
    },
  });

  const shouldPoll =
    !!invoice &&
    invoice.status !== "paid" &&
    invoice.status !== "void" &&
    (invoice.payment_status === "pending" ||
      (returnStatus === "finish" && invoice.status === "sent"));
  const polling = shouldPoll && !pollExpired;
  const { refetch: refetchInvoice } = invoiceQuery;

  useEffect(() => {
    if (!shouldPoll) return;
    const startedAt = pollStarted.current ?? Date.now();
    pollStarted.current = startedAt;
    const id = window.setInterval(() => {
      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        window.clearInterval(id);
        setPollExpired(true);
        return;
      }
      void refetchInvoice();
    }, POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
      pollStarted.current = null;
    };
  }, [shouldPoll, pollRun, invoiceId, refetchInvoice]);

  async function copyAccount() {
    const account = invoice?.bank?.bank_account;
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account);
      toast.success(t("pay.copied"));
    } catch {
      toast.error(t("pay.payFail"));
    }
  }

  const isNotFound =
    isAxiosError(invoiceQuery.error) &&
    invoiceQuery.error.response?.status === 404;

  return (
    <div className="w-full space-y-6" data-testid="pay-invoice-page">
      <PageHeader
        leading={<Receipt className="h-6 w-6 shrink-0 text-primary-text" />}
        title={t("pay.title")}
        description={t("pay.subtitle")}
        actions={
          <Button asChild variant="outline">
            <Link to="/settings/subscription">
              {t("pay.backToSubscription")}
            </Link>
          </Button>
        }
      />

      {invoiceQuery.isLoading ? (
        <div className="space-y-3" data-testid="pay-invoice-loading">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      ) : isNotFound ? (
        <WorkspaceNotice tone="idle" role="status">
          <div data-testid="pay-invoice-not-found">
            <p className="text-sm font-medium text-foreground">
              {t("pay.notFoundTitle")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("pay.notFoundBody")}
            </p>
          </div>
        </WorkspaceNotice>
      ) : invoiceQuery.isError || !invoice ? (
        <WorkspaceNotice tone="danger" role="status">
          <div data-testid="pay-invoice-error">
            <p className="text-sm font-medium text-foreground">
              {t("pay.loadError")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-10"
              onClick={() => void refetchInvoice()}
            >
              {t("pay.retry")}
            </Button>
          </div>
        </WorkspaceNotice>
      ) : (
        <WorkspaceShell
          tone={payTone(invoice.status)}
          testid="pay-invoice-card"
        >
          <WorkspaceShellHead
            icon={Receipt}
            title={invoice.number}
            hint={invoice.organization_name ?? undefined}
            aside={
              <Badge
                variant={statusVariant(invoice.status)}
                data-status={invoice.status}
                className="text-[10px] uppercase"
              >
                {t(`invoiceStatus_${invoice.status}`, {
                  defaultValue: invoice.status,
                })}
              </Badge>
            }
          />
          <WorkspaceShellBody className="space-y-4">
            <InvoiceMeta invoice={invoice} />
            <Breakdown invoice={invoice} />

            {invoice.status === "draft" ? (
              <WorkspaceNotice tone="info" role="status">
                <span data-testid="pay-invoice-draft">
                  {t("pay.statusDraft")}
                </span>
              </WorkspaceNotice>
            ) : null}

            {invoice.status === "void" ? (
              <WorkspaceNotice tone="danger" role="status">
                <span data-testid="pay-invoice-void">
                  {t("pay.statusVoid")}
                </span>
              </WorkspaceNotice>
            ) : null}

            {invoice.status === "paid" ? (
              <div data-testid="pay-invoice-paid">
                <WorkspaceNotice tone="success" role="status">
                  <div className="space-y-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                      {t("pay.statusPaid")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("pay.paidAt")}: {formatDate(invoice.paid_at, locale)}
                      {invoice.payment_method || invoice.bank_ref ? (
                        <>
                          {" · "}
                          {t("pay.method")}:{" "}
                          {invoice.payment_method ?? invoice.bank_ref}
                        </>
                      ) : null}
                    </p>
                    <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                      {formatIdr(total)}
                    </p>
                  </div>
                </WorkspaceNotice>
              </div>
            ) : null}

            {invoice.status === "sent" && total === 0 ? (
              <div data-testid="pay-invoice-paid">
                <div data-testid="pay-invoice-zero">
                  <WorkspaceNotice tone="success" role="status">
                    <div className="space-y-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <CheckCircle2 className="h-4 w-4" aria-hidden />
                        {t("pay.statusZero")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("pay.statusZeroBody")}
                      </p>
                    </div>
                  </WorkspaceNotice>
                </div>
              </div>
            ) : null}

            {payable ? (
              <div className="space-y-4" data-testid="pay-invoice-panel">
                {!invoice.can_pay ? (
                  <WorkspaceNotice tone="warn" role="status">
                    <span data-testid="pay-invoice-not-payable">
                      {invoice.payment_status === "pending"
                        ? t("pay.notPayablePending")
                        : t("pay.notPayable")}
                    </span>
                  </WorkspaceNotice>
                ) : null}

                {polling ? (
                  <WorkspaceNotice tone="info" role="status">
                    <span
                      className="flex items-center gap-1.5"
                      data-testid="pay-invoice-polling"
                    >
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden
                      />
                      {t("pay.polling")}
                    </span>
                  </WorkspaceNotice>
                ) : null}

                {pollExpired ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10"
                      onClick={() => {
                        setPollExpired(false);
                        pollStarted.current = null;
                        setPollRun((run) => run + 1);
                        void refetchInvoice();
                      }}
                      data-testid="pay-invoice-refresh"
                    >
                      <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden />
                      {t("pay.refresh")}
                    </Button>
                  </div>
                ) : null}

                <div
                  className="space-y-1.5"
                  data-testid="pay-invoice-provider"
                >
                  <Label htmlFor="pay-invoice-provider-select">
                    {t("pay.chooseProvider")}
                  </Label>
                  {providers.length > 1 ? (
                    <Select value={provider} onValueChange={setProvider}>
                      <SelectTrigger
                        id="pay-invoice-provider-select"
                        className="h-10 min-h-10 w-full sm:w-64"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {providers.map((item) => (
                          <SelectItem key={item.name} value={item.name}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-foreground">
                      {selectedProvider?.label ?? "—"}
                    </p>
                  )}
                  {selectedProvider?.mode === "sandbox" ? (
                    <p className="text-[11px] text-muted-foreground">
                      {t("pay.sandboxNote")}
                    </p>
                  ) : null}
                </div>

                <Button
                  type="button"
                  className="h-10 w-full sm:w-auto"
                  disabled={
                    !invoice.can_pay ||
                    !selectedProvider ||
                    checkoutMut.isPending
                  }
                  onClick={() => {
                    if (selectedProvider) checkoutMut.mutate(selectedProvider.name);
                  }}
                  data-testid="pay-invoice-submit"
                >
                  {checkoutMut.isPending ? (
                    <>
                      <Loader2
                        className="mr-1.5 h-4 w-4 animate-spin"
                        aria-hidden
                      />
                      {t("pay.paying")}
                    </>
                  ) : (
                    t("pay.payNow")
                  )}
                </Button>

                {invoice.bank ? (
                  <div
                    className="rounded-md border border-border bg-muted/30 p-3"
                    data-testid="pay-invoice-bank"
                  >
                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Landmark className="h-4 w-4" aria-hidden />
                      {t("pay.manualTitle")}
                    </p>
                    <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <div className="flex justify-between gap-3">
                        <dt>{t("pay.bankName")}</dt>
                        <dd className="text-foreground">
                          {invoice.bank.bank_name ?? "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>{t("pay.bankAccount")}</dt>
                        <dd className="font-mono text-foreground">
                          {invoice.bank.bank_account ?? "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>{t("pay.bankHolder")}</dt>
                        <dd className="text-foreground">
                          {invoice.bank.bank_holder ?? "—"}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">
                        {t("pay.manualBody")}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-10"
                        onClick={() => void copyAccount()}
                        data-testid="pay-invoice-copy"
                      >
                        <Copy className="mr-1 h-3.5 w-3.5" aria-hidden />
                        {t("pay.copyAccount")}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </WorkspaceShellBody>
        </WorkspaceShell>
      )}
    </div>
  );
}

export default PayInvoice;
