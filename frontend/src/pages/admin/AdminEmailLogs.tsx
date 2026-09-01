import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
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
import { adminApi, type EmailSendLogItem } from "@/api/admin";
import { useTranslation } from "react-i18next";
import { htmlLang, isAppLocale } from "@/i18n/locales";
import i18n from "@/i18n";

const PAGE_SIZE = 20;
const KIND_ALL = "all";
const STATUS_ALL = "all";
const KINDS = [
  "verification",
  "password_reset",
  "scan_diff",
  "uptime",
  "host_protect",
] as const;

function formatTime(iso: string): string {
  const lng = isAppLocale(i18n.language) ? htmlLang(i18n.language) : "id";
  return new Date(iso).toLocaleString(lng === "en" ? "en-US" : "id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function kindLabel(kind: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    verification: t("emailLogsKindVerification"),
    password_reset: t("emailLogsKindPasswordReset"),
    scan_diff: t("emailLogsKindScanDiff"),
    uptime: t("emailLogsKindUptime"),
    host_protect: t("emailLogsKindHostProtect"),
  };
  return map[kind] ?? kind;
}

function AdminEmailLogs() {
  const { t } = useTranslation("admin");
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState(KIND_ALL);
  const [status, setStatus] = useState(STATUS_ALL);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-email-logs", page, kind, status],
    queryFn: () =>
      adminApi.getEmailLogs({
        page,
        page_size: PAGE_SIZE,
        kind: kind === KIND_ALL ? undefined : kind,
        status: status === STATUS_ALL ? undefined : status,
      }),
    placeholderData: keepPreviousData,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-3">
        <Mail className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-lg font-bold tracking-wide text-foreground">
            {t("emailLogsTitle")}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {t("emailLogsSubtitle")}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm tracking-wide">
              {t("emailLogsCard")}
            </CardTitle>
            {data && data.total > 0 && (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {t("totalCount", { count: data.total })}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="email-log-kind">{t("emailLogsKind")}</Label>
              <Select
                value={kind}
                onValueChange={(v) => {
                  setKind(v);
                  setPage(1);
                }}
              >
                <SelectTrigger id="email-log-kind" className="h-10 min-h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KIND_ALL}>{t("emailLogsAll")}</SelectItem>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {kindLabel(k, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="email-log-status">{t("emailLogsStatus")}</Label>
              <Select
                value={status}
                onValueChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
              >
                <SelectTrigger id="email-log-status" className="h-10 min-h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={STATUS_ALL}>{t("emailLogsAll")}</SelectItem>
                  <SelectItem value="sent">{t("emailLogsStatusSent")}</SelectItem>
                  <SelectItem value="failed">
                    {t("emailLogsStatusFailed")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && !data ? (
            <TableRowSkeleton rows={5} />
          ) : !data || data.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 rounded-full bg-muted p-3">
                <Mail className="h-6 w-6 text-muted-foreground opacity-40" />
              </div>
              <p className="text-sm text-foreground">{t("emailLogsEmpty")}</p>
            </div>
          ) : (
            <>
              <div className="space-y-2 md:hidden">
                {data.items.map((row) => (
                  <div
                    key={row.id}
                    className="w-full rounded-lg border border-border bg-card p-3 text-left"
                  >
                    <p className="font-mono text-xs text-foreground">
                      {row.recipient_masked}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant="default" className="text-[11px]">
                        {kindLabel(row.kind, t)}
                      </Badge>
                      <Badge
                        variant={row.status === "sent" ? "completed" : "failed"}
                        className="text-[11px]"
                      >
                        {row.status === "sent"
                          ? t("emailLogsStatusSent")
                          : t("emailLogsStatusFailed")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatTime(row.created_at)} · {row.attempts}
                    </p>
                    {row.error_message ? (
                      <p className="mt-1 break-all text-[11px] text-destructive">
                        {row.error_message}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="hidden md:block">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[16%] text-[10px] uppercase tracking-wider">
                        {t("colTime")}
                      </TableHead>
                      <TableHead className="w-[16%] text-[10px] uppercase tracking-wider">
                        {t("colKind")}
                      </TableHead>
                      <TableHead className="w-[12%] text-[10px] uppercase tracking-wider">
                        {t("colStatus")}
                      </TableHead>
                      <TableHead className="w-[20%] text-[10px] uppercase tracking-wider">
                        {t("colRecipient")}
                      </TableHead>
                      <TableHead className="w-[10%] text-right text-[10px] uppercase tracking-wider">
                        {t("colAttempts")}
                      </TableHead>
                      <TableHead className="w-[26%] text-[10px] uppercase tracking-wider">
                        {t("colError")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((row: EmailSendLogItem) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatTime(row.created_at)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {kindLabel(row.kind, t)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              row.status === "sent" ? "completed" : "failed"
                            }
                            className="text-[11px]"
                          >
                            {row.status === "sent"
                              ? t("emailLogsStatusSent")
                              : t("emailLogsStatusFailed")}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.recipient_masked}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {row.attempts}
                        </TableCell>
                        <TableCell className="truncate text-xs text-muted-foreground">
                          {row.error_message ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 ? (
                <Pagination className="mt-4">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        aria-disabled={page <= 1}
                      />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        onClick={() =>
                          setPage((p) => Math.min(totalPages, p + 1))
                        }
                        aria-disabled={page >= totalPages}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminEmailLogs;
