import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ClipboardCopy,
  Download,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Wallet,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import PageHeader from "@/components/layout/PageHeader";
import {
  AdminShell,
  AdminShellBody,
  AdminShellHead,
} from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/patterns/EmptyState";
import { FormAlert } from "@/components/patterns/FormFeedback";
import { WorkspaceNotice } from "@/components/workspace/WorkspaceShell";
import { formatAiTime, formatIdr } from "@/components/admin/aiFormat";
import { apiErrorMessage } from "@/api/apiErrors";
import {
  approveAdminTopupOrder,
  fetchAdminTopupProof,
  listAdminTopupOrders,
  rejectAdminTopupOrder,
  resolveAdminTopupRefund,
  type AdminTopupOrder,
  type AdminTopupRefundAction,
} from "@/api/adminAiTopup";

const PAGE_SIZE = 20;
const STATUS_ALL = "all";

const STATUSES = [
  "pending_payment",
  "awaiting_verification",
  "paid",
  "rejected",
  "expired",
  "canceled",
  "refunded",
  "refund_review",
] as const;

function statusLabelKey(status: string): string {
  const suffix = status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return `status${suffix}`;
}

type BadgeVariant = "success" | "pending" | "info" | "failed" | "default" | "medium";

function statusBadgeVariant(status: string): BadgeVariant {
  if (status === "awaiting_verification") return "pending";
  if (status === "paid") return "success";
  if (status === "rejected") return "failed";
  if (status === "refund_review") return "medium";
  if (status === "pending_payment") return "info";
  return "default";
}

function methodLabel(
  t: (key: string) => string,
  method: string,
): string {
  if (method === "manual_transfer") return t("methodManualShort");
  if (method === "midtrans") return t("methodMidtransShort");
  return method;
}

function TopupStatusBadge({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  return (
    <Badge
      variant={statusBadgeVariant(status)}
      data-status={status}
      className="text-[10px] uppercase"
    >
      {label}
    </Badge>
  );
}

function TopupRowActions({
  item,
  desktop,
  onViewProof,
  onApprove,
  onReject,
  onResolveRefund,
  onCopyReference,
}: {
  item: AdminTopupOrder;
  desktop: boolean;
  onViewProof: (item: AdminTopupOrder) => void;
  onApprove: (item: AdminTopupOrder) => void;
  onReject: (item: AdminTopupOrder) => void;
  onResolveRefund: (item: AdminTopupOrder) => void;
  onCopyReference: (item: AdminTopupOrder) => void;
}) {
  const { t } = useTranslation("admin");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={
            desktop
              ? "h-9 w-9 p-0"
              : "h-11 w-11 min-h-11 min-w-11 p-0"
          }
          data-testid={
            desktop
              ? `topup-actions-${item.id}`
              : `topup-actions-mobile-${item.id}`
          }
          aria-label={t("actionsMenu")}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          data-testid={`topup-copy-${item.id}`}
          onSelect={() => onCopyReference(item)}
        >
          <ClipboardCopy className="mr-2 h-4 w-4" />
          {t("adminAiTopupsCopyReference")}
        </DropdownMenuItem>
        {item.has_proof ? (
          <DropdownMenuItem
            data-testid={`topup-proof-${item.id}`}
            onSelect={() => onViewProof(item)}
          >
            <Eye className="mr-2 h-4 w-4" />
            {t("adminAiTopupsViewProof")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          data-testid={`topup-approve-${item.id}`}
          onSelect={() => onApprove(item)}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {t("adminAiTopupsApprove")}
        </DropdownMenuItem>
        {item.status === "refund_review" ? (
          <DropdownMenuItem
            data-testid={`topup-resolve-refund-${item.id}`}
            onSelect={() => onResolveRefund(item)}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {t("adminAiTopupsResolveRefund")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          data-testid={`topup-reject-${item.id}`}
          onSelect={() => onReject(item)}
        >
          <XCircle className="mr-2 h-4 w-4" />
          {t("adminAiTopupsReject")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AdminAiTopups() {
  const { t } = useTranslation("admin");
  const { t: tTopup } = useTranslation("topup");
  const { i18n } = useTranslation();
  const locale = i18n.language === "en" ? "en-US" : "id-ID";
  const qc = useQueryClient();

  const [status, setStatus] = useState<string>("awaiting_verification");
  const [orgId, setOrgId] = useState("");
  const [page, setPage] = useState(1);

  const [approveTarget, setApproveTarget] = useState<AdminTopupOrder | null>(
    null,
  );
  const [bankRef, setBankRef] = useState("");
  const [force, setForce] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<AdminTopupOrder | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [refundTarget, setRefundTarget] = useState<AdminTopupOrder | null>(null);
  const [refundAction, setRefundAction] =
    useState<AdminTopupRefundAction>("clawback");
  const [refundNote, setRefundNote] = useState("");
  const [refundError, setRefundError] = useState<string | null>(null);

  const [proofTarget, setProofTarget] = useState<AdminTopupOrder | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofMime, setProofMime] = useState<string | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  const proofUrlRef = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ["admin-ai-topups", status, orgId.trim(), page],
    queryFn: () =>
      listAdminTopupOrders({
        status: status === STATUS_ALL ? undefined : status,
        organization_id: orgId.trim() || undefined,
        page,
        limit: PAGE_SIZE,
      }),
  });

  const approveMut = useMutation({
    mutationFn: (input: {
      id: string;
      bank_ref?: string;
      force?: boolean;
    }) => approveAdminTopupOrder(input.id, {
      bank_ref: input.bank_ref,
      force: input.force,
    }),
    onSuccess: () => {
      toast.success(t("adminAiTopupsApproveSuccess"));
      setApproveTarget(null);
      setBankRef("");
      setForce(false);
      void qc.invalidateQueries({ queryKey: ["admin-ai-topups"] });
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, t("adminAiTopupsApproveFail"))),
  });

  const rejectMut = useMutation({
    mutationFn: (input: { id: string; reason: string }) =>
      rejectAdminTopupOrder(input.id, { reason: input.reason }),
    onSuccess: () => {
      toast.success(t("adminAiTopupsRejectSuccess"));
      setRejectTarget(null);
      setRejectReason("");
      void qc.invalidateQueries({ queryKey: ["admin-ai-topups"] });
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, t("adminAiTopupsRejectFail"))),
  });

  const resolveRefundMut = useMutation({
    mutationFn: (input: {
      id: string;
      action: AdminTopupRefundAction;
      note?: string;
    }) =>
      resolveAdminTopupRefund(input.id, {
        action: input.action,
        note: input.note,
      }),
    onSuccess: () => {
      toast.success(t("adminAiTopupsRefundSuccess"));
      setRefundTarget(null);
      setRefundAction("clawback");
      setRefundNote("");
      setRefundError(null);
      void qc.invalidateQueries({ queryKey: ["admin-ai-topups"] });
    },
    onError: (err) => {
      setRefundError(
        apiErrorMessage(err, t("adminAiTopupsRefundFail")),
      );
    },
  });

  useEffect(
    () => () => {
      if (proofUrlRef.current) {
        URL.revokeObjectURL(proofUrlRef.current);
        proofUrlRef.current = null;
      }
    },
    [],
  );

  function closeProof() {
    if (proofUrlRef.current) {
      URL.revokeObjectURL(proofUrlRef.current);
      proofUrlRef.current = null;
    }
    setProofUrl(null);
    setProofMime(null);
    setProofTarget(null);
    setProofLoading(false);
  }

  async function openProof(item: AdminTopupOrder) {
    setProofTarget(item);
    setProofUrl(null);
    setProofMime(null);
    setProofLoading(true);
    try {
      const blob = await fetchAdminTopupProof(item.id);
      const url = URL.createObjectURL(blob);
      proofUrlRef.current = url;
      setProofMime(item.proof_mime ?? blob.type ?? "");
      setProofUrl(url);
    } catch (err) {
      toast.error(apiErrorMessage(err, t("adminAiTopupsProofLoadFail")));
      closeProof();
    } finally {
      setProofLoading(false);
    }
  }

  async function copyReference(item: AdminTopupOrder) {
    try {
      await navigator.clipboard.writeText(item.reference_code);
      toast.success(t("adminAiTopupsCopied"));
    } catch {
      toast.error(t("adminAiTopupsCopyFail"));
    }
  }

  function openApprove(item: AdminTopupOrder) {
    setApproveTarget(item);
    setBankRef("");
    setForce(false);
  }

  function openReject(item: AdminTopupOrder) {
    setRejectTarget(item);
    setRejectReason("");
  }

  function openResolveRefund(item: AdminTopupOrder) {
    setRefundTarget(item);
    setRefundAction("clawback");
    setRefundNote("");
    setRefundError(null);
  }

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const proofFileName = `topup-proof-${proofTarget?.reference_code ?? "order"}`;

  return (
    <div className="w-full space-y-6" data-testid="admin-ai-topups-page">
      <PageHeader
        leading={<ShieldCheck className="h-6 w-6 shrink-0 text-primary-text" />}
        title={t("adminAiTopupsTitle")}
        description={t("adminAiTopupsSubtitle")}
      />

      <AdminShell tone="info" testid="admin-ai-topups-filter">
        <AdminShellBody>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="admin-ai-topups-status">
                {t("adminAiTopupsFilterStatus")}
              </Label>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  id="admin-ai-topups-status"
                  data-testid="admin-ai-topups-status"
                  aria-label={t("adminAiTopupsFilterStatus")}
                  className="h-10 min-h-10"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={STATUS_ALL}>
                    {t("adminAiTopupsStatusAll")}
                  </SelectItem>
                  {STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {tTopup(statusLabelKey(value))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="admin-ai-topups-org">
                {t("adminAiTopupsFilterOrg")}
              </Label>
              <Input
                id="admin-ai-topups-org"
                type="text"
                value={orgId}
                placeholder={t("adminAiTopupsFilterOrgPlaceholder")}
                onChange={(event) => {
                  setOrgId(event.target.value);
                  setPage(1);
                }}
                className="h-10 min-h-10"
              />
            </div>
            <div className="flex min-w-0 items-end">
              <Button
                type="button"
                variant="outline"
                className="h-10 min-h-10 w-full sm:w-auto"
                disabled={query.isFetching}
                data-testid="admin-ai-topups-refresh"
                onClick={() => void query.refetch()}
              >
                <RefreshCw
                  className={
                    query.isFetching
                      ? "mr-1.5 h-4 w-4 animate-spin"
                      : "mr-1.5 h-4 w-4"
                  }
                  aria-hidden
                />
                {t("adminAiTopupsRefresh")}
              </Button>
            </div>
          </div>
        </AdminShellBody>
      </AdminShell>

      <AdminShell testid="admin-ai-topups-list" tone="primary">
        <AdminShellHead
          icon={Wallet}
          title={t("adminAiTopupsTitle")}
          hint={t("adminAiTopupsSubtitle")}
          aside={
            <Badge variant="info" className="font-mono text-[10px]">
              {total}
            </Badge>
          }
        />
        <AdminShellBody className="space-y-3">
          {query.isLoading ? (
            <TableRowSkeleton rows={5} columns={7} />
          ) : query.isError ? (
            <WorkspaceNotice tone="danger" role="status">
              <div
                className="space-y-2"
                data-testid="admin-ai-topups-error"
              >
                <p className="text-sm font-medium text-foreground">
                  {t("adminAiTopupsLoadError")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  data-testid="admin-ai-topups-retry"
                  onClick={() => void query.refetch()}
                >
                  {t("adminAiTopupsRetry")}
                </Button>
              </div>
            </WorkspaceNotice>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title={t("adminAiTopupsEmptyTitle")}
              hint={t("adminAiTopupsEmptyHint")}
              testId="admin-ai-topups-empty"
            />
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-md border border-border md:block">
                <Table data-testid="admin-ai-topups-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("adminAiTopupsColOrg")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("adminAiTopupsColReference")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("adminAiTopupsColAmount")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("adminAiTopupsColMethod")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("adminAiTopupsColStatus")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("adminAiTopupsColProof")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("adminAiTopupsColCreated")}
                      </TableHead>
                      <TableHead className="text-right text-[10px] uppercase tracking-wider">
                        {t("adminAiTopupsColActions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow
                        key={item.id}
                        data-testid={`admin-ai-topup-${item.id}`}
                      >
                        <TableCell className="text-sm text-foreground">
                          {item.organization_name ?? item.organization_id}
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums text-foreground">
                          {item.reference_code}
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums text-foreground">
                          {formatIdr(item.amount_idr)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {methodLabel(tTopup, item.payment_method)}
                        </TableCell>
                        <TableCell>
                          <TopupStatusBadge
                            status={item.status}
                            label={tTopup(statusLabelKey(item.status))}
                          />
                          {item.resolution_note &&
                          (item.status === "refund_review" ||
                            item.status === "refunded") ? (
                            <p
                              className="mt-1 text-[11px] text-muted-foreground"
                              data-testid={`topup-resolution-note-${item.id}`}
                            >
                              {t("adminAiTopupsResolutionNote", {
                                note: item.resolution_note,
                              })}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.proof_uploaded_at
                            ? formatAiTime(item.proof_uploaded_at, locale)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatAiTime(item.created_at, locale)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end">
                            <TopupRowActions
                              item={item}
                              desktop
                              onViewProof={(target) => void openProof(target)}
                              onApprove={openApprove}
                              onReject={openReject}
                              onResolveRefund={openResolveRefund}
                              onCopyReference={(target) =>
                                void copyReference(target)
                              }
                            />
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
                    data-testid={`admin-ai-topup-mobile-${item.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium text-foreground">
                        {item.organization_name ?? item.organization_id}
                      </p>
                      <TopupStatusBadge
                        status={item.status}
                        label={tTopup(statusLabelKey(item.status))}
                      />
                    </div>
                    <p className="mt-1 font-mono text-xs tabular-nums text-foreground">
                      {item.reference_code} · {formatIdr(item.amount_idr)}
                    </p>
                    {item.resolution_note &&
                    (item.status === "refund_review" ||
                      item.status === "refunded") ? (
                      <p
                        className="mt-1 text-[11px] text-muted-foreground"
                        data-testid={`topup-resolution-note-mobile-${item.id}`}
                      >
                        {t("adminAiTopupsResolutionNote", {
                          note: item.resolution_note,
                        })}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {methodLabel(tTopup, item.payment_method)} ·{" "}
                      {formatAiTime(item.created_at, locale)}
                    </p>
                    {item.proof_uploaded_at ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("adminAiTopupsColProof")}:{" "}
                        {formatAiTime(item.proof_uploaded_at, locale)}
                      </p>
                    ) : null}
                    <div className="mt-3 flex justify-end">
                      <TopupRowActions
                        item={item}
                        desktop={false}
                        onViewProof={(target) => void openProof(target)}
                        onApprove={openApprove}
                        onReject={openReject}
                        onResolveRefund={openResolveRefund}
                        onCopyReference={(target) => void copyReference(target)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!query.isLoading && !query.isError && totalPages > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {t("pageOf", { page, total: totalPages })}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t("adminAiTopupsPrev")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  {t("adminAiTopupsNext")}
                </Button>
              </div>
            </div>
          ) : null}
        </AdminShellBody>
      </AdminShell>

      <Sheet
        open={proofTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeProof();
        }}
      >
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t("adminAiTopupsProofTitle")}</SheetTitle>
            <SheetDescription>
              {proofTarget?.reference_code ?? ""}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
            {proofLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                <span className="text-sm">{t("adminAiTopupsProofLoading")}</span>
              </div>
            ) : proofUrl ? (
              proofMime === "application/pdf" ? (
                <div
                  className="space-y-3 rounded-md border border-border bg-muted/30 p-4"
                  data-testid="admin-ai-topups-proof-pdf"
                >
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <FileText className="h-4 w-4" aria-hidden />
                    {t("adminAiTopupsProofPdfBody")}
                  </div>
                  <Button asChild variant="outline" className="min-h-11">
                    <a
                      href={proofUrl}
                      download={`${proofFileName}.pdf`}
                      data-testid="admin-ai-topups-proof-download"
                    >
                      <Download className="mr-1.5 h-4 w-4" aria-hidden />
                      {t("adminAiTopupsDownloadProof")}
                    </a>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <img
                    src={proofUrl}
                    alt={t("adminAiTopupsProofAlt", {
                      reference: proofTarget?.reference_code ?? "",
                    })}
                    className="max-h-[60vh] w-full rounded-md border border-border bg-card object-contain"
                    data-testid="admin-ai-topups-proof-image"
                  />
                  <Button asChild variant="outline" className="min-h-11">
                    <a
                      href={proofUrl}
                      download={proofFileName}
                      data-testid="admin-ai-topups-proof-download"
                    >
                      <Download className="mr-1.5 h-4 w-4" aria-hidden />
                      {t("adminAiTopupsDownloadProof")}
                    </a>
                  </Button>
                </div>
              )
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={approveTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setApproveTarget(null);
            setBankRef("");
            setForce(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("adminAiTopupsApproveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("adminAiTopupsApproveBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="admin-ai-topups-bank-ref">
                {t("adminAiTopupsBankRef")}
              </Label>
              <Input
                id="admin-ai-topups-bank-ref"
                type="text"
                maxLength={64}
                value={bankRef}
                placeholder={t("adminAiTopupsBankRefPlaceholder")}
                onChange={(event) => setBankRef(event.target.value)}
                data-testid="admin-ai-topups-bank-ref"
              />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="admin-ai-topups-force"
                checked={force}
                onCheckedChange={(value) => setForce(value === true)}
                data-testid="admin-ai-topups-force"
                className="mt-0.5"
              />
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="admin-ai-topups-force">
                  {t("adminAiTopupsForce")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("adminAiTopupsForceHint")}
                </p>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">
              {t("adminAiTopupsCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={approveMut.isPending}
              data-testid="admin-ai-topups-approve-submit"
              onClick={(event) => {
                event.preventDefault();
                if (!approveTarget) return;
                const trimmed = bankRef.trim();
                approveMut.mutate({
                  id: approveTarget.id,
                  bank_ref: trimmed || undefined,
                  force,
                });
              }}
            >
              {approveMut.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              {t("adminAiTopupsApproveConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("adminAiTopupsRejectTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("adminAiTopupsRejectBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="admin-ai-topups-reject-reason">
              {t("adminAiTopupsRejectReason")}
            </Label>
            <Textarea
              id="admin-ai-topups-reject-reason"
              value={rejectReason}
              maxLength={255}
              placeholder={t("adminAiTopupsRejectReasonPlaceholder")}
              onChange={(event) => setRejectReason(event.target.value)}
              data-testid="admin-ai-topups-reject-reason"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">
              {t("adminAiTopupsCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={rejectMut.isPending || rejectReason.trim() === ""}
              data-testid="admin-ai-topups-reject-submit"
              onClick={(event) => {
                event.preventDefault();
                if (!rejectTarget) return;
                const reason = rejectReason.trim();
                if (!reason) return;
                rejectMut.mutate({ id: rejectTarget.id, reason });
              }}
            >
              {rejectMut.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              {t("adminAiTopupsRejectConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={refundTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRefundTarget(null);
            setRefundAction("clawback");
            setRefundNote("");
            setRefundError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("adminAiTopupsRefundTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("adminAiTopupsRefundBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="admin-ai-topups-refund-action">
                {t("adminAiTopupsRefundAction")}
              </Label>
              <Select
                value={refundAction}
                onValueChange={(value) => {
                  setRefundAction(value as AdminTopupRefundAction);
                  setRefundError(null);
                }}
              >
                <SelectTrigger
                  id="admin-ai-topups-refund-action"
                  data-testid="admin-ai-topups-refund-action"
                  aria-label={t("adminAiTopupsRefundAction")}
                  className="h-10 min-h-10"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clawback">
                    {t("adminAiTopupsRefundClawback")}
                  </SelectItem>
                  <SelectItem value="write_off">
                    {t("adminAiTopupsRefundWriteOff")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {refundAction === "clawback"
                  ? t("adminAiTopupsRefundClawbackHint")
                  : t("adminAiTopupsRefundWriteOffHint")}
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="admin-ai-topups-refund-note">
                {t("adminAiTopupsRefundNote")}
              </Label>
              <Textarea
                id="admin-ai-topups-refund-note"
                value={refundNote}
                maxLength={255}
                placeholder={t("adminAiTopupsRefundNotePlaceholder")}
                onChange={(event) => {
                  setRefundNote(event.target.value);
                  setRefundError(null);
                }}
                data-testid="admin-ai-topups-refund-note"
              />
            </div>
            {refundError ? (
              <div data-testid="admin-ai-topups-refund-error">
                <FormAlert message={refundError} />
              </div>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">
              {t("adminAiTopupsCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={resolveRefundMut.isPending}
              data-testid="admin-ai-topups-refund-submit"
              onClick={(event) => {
                event.preventDefault();
                if (!refundTarget) return;
                const note = refundNote.trim();
                resolveRefundMut.mutate({
                  id: refundTarget.id,
                  action: refundAction,
                  note: note || undefined,
                });
              }}
            >
              {resolveRefundMut.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              {t("adminAiTopupsRefundConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default AdminAiTopups;
