import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, ClipboardList, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import PageHeader from "@/components/layout/PageHeader";
import { AdminNotice, AdminShell, AdminShellBody, AdminShellHead } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/Badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
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
import { EmptyState } from "@/components/patterns/EmptyState";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/Pagination";
import { useTierMap } from "@/hooks/useTierMap";
import {
  approveAdminSubscriptionRequest,
  listAdminSubscriptionRequests,
  rejectAdminSubscriptionRequest,
  type SubscriptionRequestItem,
} from "@/api/subscription";
import { apiErrorMessage } from "@/api/apiErrors";

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusVariant(
  status: SubscriptionRequestItem["status"],
): "success" | "pending" | "failed" | "default" {
  if (status === "approved") return "success";
  if (status === "pending") return "pending";
  if (status === "rejected") return "failed";
  return "default";
}

const PAGE_SIZE = 50;

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

function AdminSubscriptionRequests() {
  const { t, i18n } = useTranslation("admin");
  const { label: tierLabel } = useTierMap();
  const dateLocale = i18n.language === "en" ? "en-US" : "id-ID";
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [rejectTarget, setRejectTarget] = useState<SubscriptionRequestItem | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const query = useQuery({
    queryKey: ["admin-subscription-requests", status, page],
    queryFn: () =>
      listAdminSubscriptionRequests({
        status: status === "all" ? undefined : status,
        page,
        page_size: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const approveMut = useMutation({
    mutationFn: (request: SubscriptionRequestItem) =>
      approveAdminSubscriptionRequest(request.id, ""),
    onSuccess: () => {
      toast.success(t("subscriptionRequestApproved"));
      void qc.invalidateQueries({ queryKey: ["admin-subscription-requests"] });
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, t("subscriptionRequestApproveFail"))),
  });

  const rejectMut = useMutation({
    mutationFn: (request: SubscriptionRequestItem) =>
      rejectAdminSubscriptionRequest(request.id, rejectNote.trim()),
    onSuccess: () => {
      toast.success(t("subscriptionRequestRejected"));
      setRejectTarget(null);
      setRejectNote("");
      void qc.invalidateQueries({ queryKey: ["admin-subscription-requests"] });
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, t("subscriptionRequestRejectFail"))),
  });

  const items = query.data?.items ?? [];
  const pending = approveMut.isPending || rejectMut.isPending;

  function changeLabel(item: SubscriptionRequestItem): string {
    return `${tierLabel(item.current_sku)} → ${tierLabel(item.target_sku)}`;
  }

  function cycleLabel(item: SubscriptionRequestItem): string {
    return t(`subscriptionRequestCycle_${item.cycle}`);
  }

  return (
    <div className="w-full space-y-6" data-testid="admin-subscription-requests-page">
      <PageHeader
        leading={<ClipboardList className="h-6 w-6 shrink-0 text-primary-text" />}
        title={t("subscriptionRequestsTitle")}
        description={t("subscriptionRequestsHint")}
      />

      <AdminShell testid="subscription-requests-guide" tone="info">
        <AdminShellHead
          icon={BookOpen}
          title={t("reqGuideTitle")}
          hint={t("reqGuideHint")}
        />
        <AdminShellBody>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="steps">
              <AccordionTrigger>{t("reqGuideStepsTitle")}</AccordionTrigger>
              <AccordionContent>
                <ol className="ml-4 list-decimal space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <li>{t("reqGuideStep1")}</li>
                  <li>{t("reqGuideStep2")}</li>
                  <li>{t("reqGuideStep3")}</li>
                  <li>{t("reqGuideStep4")}</li>
                </ol>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="decision">
              <AccordionTrigger>{t("reqGuideDecisionTitle")}</AccordionTrigger>
              <AccordionContent>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("reqGuideDecisionBody")}
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="limits">
              <AccordionTrigger>{t("reqGuideLimitsTitle")}</AccordionTrigger>
              <AccordionContent>
                <ul className="ml-4 list-disc space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <li>{t("reqGuideLimit1")}</li>
                  <li>{t("reqGuideLimit2")}</li>
                  <li>{t("reqGuideLimit3")}</li>
                  <li>{t("reqGuideLimit4")}</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </AdminShellBody>
      </AdminShell>

      <AdminShell tone="info" testid="admin-subscription-requests-filter">
        <AdminShellBody>
          <div className="flex min-w-0 flex-col gap-1.5 sm:max-w-56">
            <Label htmlFor="admin-subscription-request-status">
              {t("subscriptionRequestFilter")}
            </Label>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            >
              <SelectTrigger
                id="admin-subscription-request-status"
                className="h-10 min-h-10"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">
                  {t("subscriptionRequestStatus_pending")}
                </SelectItem>
                <SelectItem value="approved">
                  {t("subscriptionRequestStatus_approved")}
                </SelectItem>
                <SelectItem value="rejected">
                  {t("subscriptionRequestStatus_rejected")}
                </SelectItem>
                <SelectItem value="canceled">
                  {t("subscriptionRequestStatus_canceled")}
                </SelectItem>
                <SelectItem value="all">{t("subscriptionRequestAll")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </AdminShellBody>
      </AdminShell>

      <AdminShell testid="admin-subscription-requests-list">
        <AdminShellHead
          icon={ClipboardList}
          title={t("subscriptionRequestsTitle")}
          hint={t("subscriptionRequestsHint")}
          aside={
            <Badge variant="info" className="font-mono text-[10px]">
              {query.data?.total ?? 0}
            </Badge>
          }
        />
        <AdminShellBody className="space-y-3">
          <AdminNotice tone="info" role="status">
            {t("subscriptionRequestApproveHint")}
          </AdminNotice>
          {query.isLoading ? (
            <TableRowSkeleton rows={4} columns={6} />
          ) : query.isError ? (
            <p className="text-sm text-muted-foreground" data-testid="admin-subscription-requests-error">
              {t("subscriptionRequestsLoadError")}
            </p>
          ) : items.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={t("subscriptionRequestsEmpty")}
              testId="admin-subscription-requests-empty"
            />
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-md border border-border md:block">
                <Table data-testid="admin-subscription-requests-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("subscriptionRequestOrg")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("subscriptionRequestRequestedBy")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("subscriptionRequestChange")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("subscriptionRequestCycle")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("subscriptionRequestCreated")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("subscriptionRequestStatus")}
                      </TableHead>
                      <TableHead className="text-right text-[10px] uppercase tracking-wider">
                        {t("subscriptionRequestActions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow
                        key={item.id}
                        data-testid={`admin-subscription-request-${item.id}`}
                      >
                        <TableCell className="text-sm text-foreground">
                          {item.organization_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.requested_by_email ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums text-foreground">
                          {changeLabel(item)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {cycleLabel(item)}
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                          {formatDate(item.created_at, dateLocale)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={statusVariant(item.status)}
                            data-status={item.status}
                            className="text-[10px] uppercase"
                          >
                            {t(`subscriptionRequestStatus_${item.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {item.status === "pending" ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={pending}
                                onClick={() => approveMut.mutate(item)}
                                data-testid={`admin-subscription-approve-${item.id}`}
                              >
                                {approveMut.isPending ? (
                                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                                ) : (
                                  <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
                                )}
                                {t("subscriptionRequestApprove")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={pending}
                                onClick={() => {
                                  setRejectTarget(item);
                                  setRejectNote("");
                                }}
                                data-testid={`admin-subscription-reject-${item.id}`}
                              >
                                <X className="mr-1 h-3.5 w-3.5" aria-hidden />
                                {t("subscriptionRequestReject")}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {item.resolution_note || "—"}
                            </span>
                          )}
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
                    data-testid={`admin-subscription-request-mobile-${item.id}`}
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
                        {t(`subscriptionRequestStatus_${item.status}`)}
                      </Badge>
                    </div>
                    <p className="mt-1 font-mono text-xs tabular-nums text-foreground">
                      {changeLabel(item)} · {cycleLabel(item)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.requested_by_email ?? "—"} · {formatDate(item.created_at, dateLocale)}
                    </p>
                    {item.note ? (
                      <p className="mt-2 text-xs text-muted-foreground">{item.note}</p>
                    ) : null}
                    {item.status === "pending" ? (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="min-h-11"
                          disabled={pending}
                          onClick={() => approveMut.mutate(item)}
                        >
                          {t("subscriptionRequestApprove")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="min-h-11"
                          disabled={pending}
                          onClick={() => {
                            setRejectTarget(item);
                            setRejectNote("");
                          }}
                        >
                          {t("subscriptionRequestReject")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
          <Pager
            page={page}
            total={query.data?.total ?? 0}
            onPage={setPage}
            testId="subscription-requests"
          />
        </AdminShellBody>
      </AdminShell>

      <AlertDialog
        open={rejectTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectNote("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("subscriptionRequestRejectTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("subscriptionRequestRejectBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="admin-subscription-reject-note">
              {t("subscriptionRequestNote")}
            </Label>
            <Textarea
              id="admin-subscription-reject-note"
              value={rejectNote}
              maxLength={500}
              placeholder={t("subscriptionRequestNotePlaceholder")}
              onChange={(event) => setRejectNote(event.target.value)}
              data-testid="admin-subscription-reject-note"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">
              {t("subscriptionRequestCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={rejectMut.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (rejectTarget) rejectMut.mutate(rejectTarget);
              }}
              data-testid="admin-subscription-reject-submit"
            >
              {rejectMut.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              {t("subscriptionRequestConfirmReject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default AdminSubscriptionRequests;
