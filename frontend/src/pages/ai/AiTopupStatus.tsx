import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import {
  CheckCircle2,
  Copy,
  FileWarning,
  Landmark,
  Loader2,
  RefreshCw,
  Upload,
  Wallet,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import PageHeader from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
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
import { buttonVariants } from "@/components/ui/buttonVariants";
import {
  WorkspaceNotice,
  WorkspaceShell,
  WorkspaceShellBody,
  WorkspaceShellHead,
} from "@/components/workspace/WorkspaceShell";
import {
  methodLabel,
  statusBadgeVariant,
  statusLabelKey,
  statusTone,
} from "@/components/ai/topupStatus";
import { apiErrorMessage } from "@/api/apiErrors";
import { getAiWallet } from "@/api/ai";
import {
  cancelTopupOrder,
  checkoutTopupOrder,
  getTopupOrder,
  PROOF_ACCEPT,
  proofFileError,
  uploadTopupProof,
} from "@/api/aiTopup";
import { formatAiTime, formatIdr } from "@/components/admin/aiFormat";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 60_000;

const SETTLED_STATUSES = new Set([
  "paid",
  "rejected",
  "expired",
  "canceled",
  "refunded",
  "refund_review",
]);

export default function AiTopupStatus() {
  const { orderId } = useParams<{ orderId: string }>();
  const { t, i18n } = useTranslation("topup");
  const locale = i18n.language === "en" ? "en-US" : "id-ID";
  const orgId = useAuthStore((s) => s.activeOrgId);
  const qc = useQueryClient();
  const [pollRun, setPollRun] = useState(0);
  const [pollExpired, setPollExpired] = useState(false);
  const pollStarted = useRef<number | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const orderQuery = useQuery({
    queryKey: ["ai-topup-order", orderId],
    queryFn: () => getTopupOrder(orderId!),
    enabled: Boolean(orderId),
    retry: false,
  });

  const order = orderQuery.data;

  const walletQuery = useQuery({
    queryKey: ["ai-wallet", orgId],
    queryFn: getAiWallet,
    enabled: Boolean(orgId) && order?.status === "paid",
    retry: false,
  });

  const proofMut = useMutation({
    mutationFn: (file: File) => {
      if (!orderId) throw new Error("order_not_loaded");
      return uploadTopupProof(orderId, file);
    },
    onSuccess: () => {
      toast.success(t("proofUploadedToast"));
      setProofFile(null);
      setProofError(null);
      if (fileRef.current) fileRef.current.value = "";
      void qc.invalidateQueries({ queryKey: ["ai-topup-order", orderId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, t("proofUploadFail"))),
  });

  const checkoutMut = useMutation({
    mutationFn: () => {
      if (!orderId) throw new Error("order_not_loaded");
      return checkoutTopupOrder(orderId);
    },
    onSuccess: (result) => {
      window.location.assign(result.redirect_url);
    },
    onError: (err) => toast.error(apiErrorMessage(err, t("checkoutFail"))),
  });

  const cancelMut = useMutation({
    mutationFn: () => {
      if (!orderId) throw new Error("order_not_loaded");
      return cancelTopupOrder(orderId);
    },
    onSuccess: () => {
      toast.success(t("canceledToast"));
      setCancelOpen(false);
      void qc.invalidateQueries({ queryKey: ["ai-topup-order", orderId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, t("cancelFail"))),
  });

  const shouldPoll =
    !!order &&
    (order.status === "pending_payment" ||
      order.status === "awaiting_verification");
  const polling = shouldPoll && !pollExpired;
  const { refetch: refetchOrder } = orderQuery;

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
      void refetchOrder();
    }, POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
      pollStarted.current = null;
    };
  }, [shouldPoll, pollRun, orderId, refetchOrder]);

  async function copyText(value: string | null | undefined) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFail"));
    }
  }

  function acceptFile(file: File) {
    const error = proofFileError(file);
    if (error === "too-large") {
      setProofError(t("proofTooLarge"));
      setProofFile(null);
      return;
    }
    if (error === "bad-type") {
      setProofError(t("proofBadType"));
      setProofFile(null);
      return;
    }
    setProofError(null);
    setProofFile(file);
  }

  function onFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) acceptFile(file);
  }

  const isNotFound =
    isAxiosError(orderQuery.error) &&
    orderQuery.error.response?.status === 404;

  const canUploadProof =
    !!order &&
    order.payment_method === "manual_transfer" &&
    (order.status === "pending_payment" ||
      order.status === "awaiting_verification");
  const canCancel =
    !!order &&
    (order.status === "pending_payment" ||
      order.status === "awaiting_verification");
  const showBank =
    !!order &&
    order.status === "pending_payment" &&
    order.payment_method === "manual_transfer" &&
    !!order.bank;
  const showMidtransPay =
    !!order &&
    order.status === "pending_payment" &&
    order.payment_method === "midtrans";

  return (
    <div className="w-full space-y-6" data-testid="ai-topup-status-page">
      <PageHeader
        leading={<Wallet className="h-6 w-6 shrink-0 text-primary-text" />}
        title={t("statusTitle")}
        description={
          order ? `${t("statusCodeLabel")}: ${order.reference_code}` : undefined
        }
        actions={
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/ai/topup">{t("backToTopup")}</Link>
          </Button>
        }
      />

      {orderQuery.isLoading ? (
        <div className="space-y-3" data-testid="ai-topup-status-loading">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      ) : isNotFound ? (
        <WorkspaceNotice tone="idle" role="status">
          <div className="space-y-2" data-testid="ai-topup-status-not-found">
            <p className="text-sm font-medium text-foreground">
              {t("notFoundTitle")}
            </p>
            <p className="text-xs text-muted-foreground">{t("notFoundBody")}</p>
            <Button asChild variant="outline" size="sm" className="min-h-11">
              <Link to="/ai/topup">{t("backToTopup")}</Link>
            </Button>
          </div>
        </WorkspaceNotice>
      ) : orderQuery.isError || !order ? (
        <WorkspaceNotice tone="danger" role="status">
          <div className="space-y-2" data-testid="ai-topup-status-error">
            <p className="text-sm font-medium text-foreground">
              {t("orderLoadError")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => void refetchOrder()}
            >
              {t("retry")}
            </Button>
          </div>
        </WorkspaceNotice>
      ) : (
        <WorkspaceShell tone={statusTone(order.status)} testid="ai-topup-status-card">
          <WorkspaceShellHead
            icon={Wallet}
            title={order.reference_code}
            hint={methodLabel(t, order.payment_method)}
            aside={
              <Badge
                variant={statusBadgeVariant(order.status)}
                data-status={order.status}
                className="text-[10px] uppercase"
              >
                {t(statusLabelKey(order.status))}
              </Badge>
            }
          />
          <WorkspaceShellBody className="space-y-4">
            <dl className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t("orderAmount")}</dt>
                <dd className="font-mono font-semibold tabular-nums text-foreground">
                  {formatIdr(order.amount_idr)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t("orderCredit")}</dt>
                <dd className="font-mono tabular-nums text-foreground">
                  {formatIdr(order.credit_idr)}
                </dd>
              </div>
              {order.bonus_idr > 0 ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">{t("orderBonus")}</dt>
                  <dd className="font-mono tabular-nums text-primary-text">
                    {formatIdr(order.bonus_idr)}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
                <dt className="text-muted-foreground">{t("orderMethod")}</dt>
                <dd className="text-foreground">
                  {methodLabel(t, order.payment_method)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t("orderCreated")}</dt>
                <dd className="text-foreground">
                  {formatAiTime(order.created_at, locale)}
                </dd>
              </div>
              {!SETTLED_STATUSES.has(order.status) ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">{t("orderExpires")}</dt>
                  <dd className="text-foreground">
                    {formatAiTime(order.expires_at, locale)}
                  </dd>
                </div>
              ) : null}
            </dl>

            {polling ? (
              <WorkspaceNotice tone="info" role="status">
                <span
                  className="flex items-center gap-1.5"
                  data-testid="ai-topup-status-polling"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  {t("polling")}
                </span>
              </WorkspaceNotice>
            ) : null}

            {pollExpired && shouldPoll ? (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  data-testid="ai-topup-status-refresh"
                  onClick={() => {
                    setPollExpired(false);
                    pollStarted.current = null;
                    setPollRun((run) => run + 1);
                    void refetchOrder();
                  }}
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden />
                  {t("checkAgain")}
                </Button>
              </div>
            ) : null}

            {showBank ? (
              <div
                className="rounded-md border border-border bg-muted/30 p-3"
                data-testid="ai-topup-bank"
              >
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Landmark className="h-4 w-4" aria-hidden />
                  {t("bankTitle")}
                </p>
                <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between gap-3">
                    <dt>{t("bankName")}</dt>
                    <dd className="text-foreground">
                      {order.bank?.bank_name ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>{t("bankAccount")}</dt>
                    <dd className="font-mono text-foreground">
                      {order.bank?.bank_account ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>{t("bankHolder")}</dt>
                    <dd className="text-foreground">
                      {order.bank?.bank_holder ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>{t("bankAmount")}</dt>
                    <dd className="font-mono font-semibold text-foreground">
                      {formatIdr(order.amount_idr)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>{t("bankNoteLabel")}</dt>
                    <dd
                      className="font-mono text-foreground"
                      data-testid="ai-topup-reference"
                    >
                      {order.reference_code}
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("bankNoteHint")}
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    data-testid="ai-topup-copy-account"
                    onClick={() => void copyText(order.bank?.bank_account)}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" aria-hidden />
                    {t("copyAccount")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    data-testid="ai-topup-copy-reference"
                    onClick={() => void copyText(order.reference_code)}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" aria-hidden />
                    {t("copyReference")}
                  </Button>
                </div>
              </div>
            ) : null}

            {showMidtransPay ? (
              <div
                className="rounded-md border border-border bg-muted/30 p-3"
                data-testid="ai-topup-midtrans"
              >
                <p className="text-sm font-medium text-foreground">
                  {t("midtransTitle")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("midtransBody")}
                </p>
                <Button
                  type="button"
                  className="mt-3 min-h-11 w-full sm:w-auto"
                  disabled={checkoutMut.isPending}
                  data-testid="ai-topup-pay-now"
                  onClick={() => checkoutMut.mutate()}
                >
                  {checkoutMut.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                      {t("paying")}
                    </>
                  ) : (
                    t("payNow")
                  )}
                </Button>
                <p className="mt-3 text-xs text-muted-foreground">
                  {t("switchMethodHint")}
                </p>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="mt-2 min-h-11"
                >
                  <Link to="/ai/topup">{t("createAnother")}</Link>
                </Button>
              </div>
            ) : null}

            {order.status === "awaiting_verification" ? (
              <WorkspaceNotice tone="info" role="status">
                <div className="space-y-1" data-testid="ai-topup-awaiting">
                  <p className="text-sm font-medium text-foreground">
                    {t("awaitingTitle")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("awaitingBody")}
                  </p>
                  {order.proof_uploaded_at ? (
                    <p className="text-xs text-muted-foreground">
                      {t("proofUploadedAt", {
                        date: formatAiTime(order.proof_uploaded_at, locale),
                      })}
                    </p>
                  ) : null}
                </div>
              </WorkspaceNotice>
            ) : null}

            {canUploadProof ? (
              <div className="space-y-3" data-testid="ai-topup-proof">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {order.status === "awaiting_verification"
                      ? t("proofReupload")
                      : t("proofTitle")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("proofHint")}
                  </p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept={PROOF_ACCEPT}
                  className="hidden"
                  data-testid="ai-topup-proof-input"
                  onChange={onFilePicked}
                />
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    const file = event.dataTransfer.files[0];
                    if (file) acceptFile(file);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card",
                  )}
                >
                  <Upload
                    className={cn(
                      "h-8 w-8",
                      isDragging ? "text-primary-text" : "text-muted-foreground",
                    )}
                    aria-hidden
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("proofDropHint")}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    data-testid="ai-topup-proof-browse"
                    onClick={() => fileRef.current?.click()}
                  >
                    {t("proofChoose")}
                  </Button>
                </div>

                {proofFile ? (
                  <p
                    className="break-all font-mono text-xs text-foreground"
                    data-testid="ai-topup-proof-filename"
                  >
                    {proofFile.name}
                  </p>
                ) : null}

                {proofError ? (
                  <p
                    className="flex items-center gap-1.5 text-xs text-destructive"
                    role="alert"
                    data-testid="ai-topup-proof-error"
                  >
                    <FileWarning className="h-3.5 w-3.5" aria-hidden />
                    {proofError}
                  </p>
                ) : null}

                <Button
                  type="button"
                  className="min-h-11 w-full sm:w-auto"
                  disabled={!proofFile || proofMut.isPending}
                  data-testid="ai-topup-proof-submit"
                  onClick={() => {
                    if (!proofFile) return;
                    proofMut.mutate(proofFile);
                  }}
                >
                  {proofMut.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                      {t("proofUploading")}
                    </>
                  ) : (
                    t("proofUpload")
                  )}
                </Button>
              </div>
            ) : null}

            {order.status === "paid" ? (
              <WorkspaceNotice tone="success" role="status">
                <div className="space-y-1" data-testid="ai-topup-paid">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    {t("paidTitle")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("paidBody", { credit: formatIdr(order.credit_idr) })}
                  </p>
                  {order.paid_at ? (
                    <p className="text-xs text-muted-foreground">
                      {formatAiTime(order.paid_at, locale)}
                    </p>
                  ) : null}
                  {walletQuery.data ? (
                    <p
                      className="text-xs text-muted-foreground"
                      data-testid="ai-topup-paid-balance"
                    >
                      {t("paidBalanceHint", {
                        balance: formatIdr(walletQuery.data.balance_idr),
                      })}
                    </p>
                  ) : null}
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="mt-1 min-h-11"
                  >
                    <Link to="/ai">{t("backToAi")}</Link>
                  </Button>
                </div>
              </WorkspaceNotice>
            ) : null}

            {order.status === "rejected" ? (
              <WorkspaceNotice tone="danger" role="status">
                <div data-testid="ai-topup-rejected">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <XCircle className="h-4 w-4" aria-hidden />
                    {t("rejectedTitle")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("rejectedBody")}
                  </p>
                </div>
              </WorkspaceNotice>
            ) : null}

            {order.status === "expired" ? (
              <WorkspaceNotice tone="idle" role="status">
                <div data-testid="ai-topup-expired">
                  <p className="text-sm font-medium text-foreground">
                    {t("expiredTitle")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("expiredBody")}
                  </p>
                </div>
              </WorkspaceNotice>
            ) : null}

            {order.status === "canceled" ? (
              <WorkspaceNotice tone="idle" role="status">
                <div data-testid="ai-topup-canceled">
                  <p className="text-sm font-medium text-foreground">
                    {t("canceledTitle")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("canceledBody")}
                  </p>
                </div>
              </WorkspaceNotice>
            ) : null}

            {order.status === "refunded" ? (
              <WorkspaceNotice tone="idle" role="status">
                <div data-testid="ai-topup-refunded">
                  <p className="text-sm font-medium text-foreground">
                    {t("refundedTitle")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("refundedBody")}
                  </p>
                </div>
              </WorkspaceNotice>
            ) : null}

            {order.status === "refund_review" ? (
              <WorkspaceNotice tone="warn" role="status">
                <div data-testid="ai-topup-refund-review">
                  <p className="text-sm font-medium text-foreground">
                    {t("refundReviewTitle")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("refundReviewBody")}
                  </p>
                </div>
              </WorkspaceNotice>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {canCancel ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  data-testid="ai-topup-cancel"
                  onClick={() => setCancelOpen(true)}
                  disabled={cancelMut.isPending}
                >
                  {t("cancelOrder")}
                </Button>
              ) : null}
              {SETTLED_STATUSES.has(order.status) ? (
                <Button asChild variant="outline" className="min-h-11">
                  <Link to="/ai/topup">{t("createAnother")}</Link>
                </Button>
              ) : null}
            </div>

            <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("cancelTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("cancelBody")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="min-h-11">
                    {t("cancelKeep")}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className={buttonVariants({ variant: "destructive" })}
                    data-testid="ai-topup-cancel-confirm"
                    onClick={(event) => {
                      event.preventDefault();
                      cancelMut.mutate();
                    }}
                  >
                    {t("cancelConfirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </WorkspaceShellBody>
        </WorkspaceShell>
      )}
    </div>
  );
}
