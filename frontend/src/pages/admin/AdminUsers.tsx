import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Users, Search, Eye } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
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
  AdminShell,
  AdminShellBody,
  AdminShellHead,
} from "@/components/admin/AdminShell";
import { SiemRail } from "@/components/siem/siemChrome";
import { adminRailClass, userTone } from "@/components/admin/adminChrome";
import PageHeader from "@/components/layout/PageHeader";
import { adminApi } from "@/api/admin";
import type { AdminUserItem } from "@/api/admin";
import { useTranslation } from "react-i18next";
import { htmlLang, isAppLocale } from "@/i18n/locales";
import i18n from "@/i18n";

const PAGE_SIZE = 20;

function formatDate(iso: string): string {
  const lng = isAppLocale(i18n.language) ? htmlLang(i18n.language) : "id";
  return new Date(iso).toLocaleDateString(lng === "en" ? "en-US" : "id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(iso: string): string {
  const lng = isAppLocale(i18n.language) ? htmlLang(i18n.language) : "id";
  return new Date(iso).toLocaleString(lng === "en" ? "en-US" : "id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AdminUsers() {
  const { t } = useTranslation("admin");
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", page, search],
    queryFn: () =>
      adminApi.getUsers({ page, page_size: PAGE_SIZE, search: search || undefined }),
    placeholderData: keepPreviousData,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <div className="w-full space-y-6">
      <PageHeader
        leading={<Users className="h-6 w-6 shrink-0 text-primary" />}
        title={t("usersTitle")}
        description={t("usersSubtitle")}
      />

      <AdminShell tone="primary">
        <AdminShellHead
          icon={Users}
          title={t("usersCard")}
          aside={
            data && data.total > 0 ? (
              <span className="text-[10px] text-muted-foreground">
                {t("totalCount", { count: data.total })}
              </span>
            ) : null
          }
        />
        <AdminShellBody>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="admin-users-search">{t("colEmail")}</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="admin-users-search"
                  type="text"
                  placeholder={t("searchEmail")}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="h-10 min-h-10 w-full pl-8 text-sm"
                />
              </div>
            </div>
          </div>

          {isLoading && !data ? (
            <TableRowSkeleton rows={5} columns={8} />
          ) : !data || data.users.length === 0 ? (
            <div
              className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-8 text-center"
              data-testid="admin-users-empty"
            >
              <Users className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium text-foreground">
                {t("usersEmpty")}
              </p>
              <p className="max-w-md text-xs text-muted-foreground">
                {search ? t("usersEmptySearch") : t("usersEmptyNone")}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2 md:hidden">
                {data?.users.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => navigate(`/admin/users/${user.id}`)}
                    className="relative min-h-11 w-full overflow-hidden rounded-lg border border-border bg-card p-3 pl-4 text-left"
                  >
                    <SiemRail
                      className={adminRailClass(userTone(user))}
                    />
                    <p className="break-all font-mono text-xs text-foreground">
                      {user.email}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge
                        variant={user.is_admin ? "completed" : "default"}
                        className="text-[11px]"
                      >
                        {user.is_admin ? t("roleAdmin") : t("roleUser")}
                      </Badge>
                      <Badge
                        variant={user.is_verified ? "completed" : "pending"}
                        className="text-[11px]"
                      >
                        {user.is_verified ? t("verified") : t("unverified")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {user.credits} · {user.scan_count} ·{" "}
                      {formatDate(user.created_at)} ·{" "}
                      {user.last_login_at
                        ? formatDateTime(user.last_login_at)
                        : t("lastLoginNever")}
                    </p>
                  </button>
                ))}
              </div>
              <div className="hidden md:block">
                <div className="overflow-hidden rounded-md border border-border">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[22%] text-[10px] uppercase tracking-wider">
                          {t("colEmail")}
                        </TableHead>
                        <TableHead className="w-[10%] text-[10px] uppercase tracking-wider">
                          {t("colRole")}
                        </TableHead>
                        <TableHead className="w-[10%] text-[10px] uppercase tracking-wider">
                          {t("colVerified")}
                        </TableHead>
                        <TableHead className="w-[10%] text-right text-[10px] uppercase tracking-wider">
                          {t("colCredits")}
                        </TableHead>
                        <TableHead className="w-[8%] text-right text-[10px] uppercase tracking-wider">
                          {t("colScans")}
                        </TableHead>
                        <TableHead className="w-[12%] text-[10px] uppercase tracking-wider">
                          {t("colCreated")}
                        </TableHead>
                        <TableHead className="w-[16%] text-[10px] uppercase tracking-wider">
                          {t("colLastLogin")}
                        </TableHead>
                        <TableHead className="w-[12%] whitespace-nowrap text-right text-[10px] uppercase tracking-wider">
                          {t("colActions")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data?.users.map((user) => (
                        <UserRow
                          key={user.id}
                          user={user}
                          onView={() => navigate(`/admin/users/${user.id}`)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}

          {!isLoading && totalPages > 1 && (
            <Pagination className="mt-4">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  />
                </PaginationItem>
                <PaginationItem>
                  <span className="px-2 font-mono text-xs tabular-nums text-muted-foreground">
                    {t("pageOf", { page, total: totalPages })}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </AdminShellBody>
      </AdminShell>
    </div>
  );
}

function UserRow({ user, onView }: { user: AdminUserItem; onView: () => void }) {
  const { t } = useTranslation("admin");
  return (
    <TableRow className="h-12 hover:bg-muted/50">
      <TableCell className="relative pl-4">
        <SiemRail className={adminRailClass(userTone(user))} />
        <span
          className="block max-w-[min(36rem,50vw)] truncate font-mono text-xs text-foreground 2xl:max-w-none 2xl:overflow-visible 2xl:whitespace-normal"
          title={user.email}
        >
          {user.email}
        </span>
      </TableCell>
      <TableCell>
        <Badge
          variant={user.is_admin ? "completed" : "default"}
          className="text-[11px]"
        >
          {user.is_admin ? t("roleAdmin") : t("roleUser")}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge
          variant={user.is_verified ? "completed" : "pending"}
          className="text-[11px]"
        >
          {user.is_verified ? t("verified") : t("unverified")}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <span className="font-mono text-xs tabular-nums text-foreground">{user.credits}</span>
      </TableCell>
      <TableCell className="text-right">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {user.scan_count}
        </span>
      </TableCell>
      <TableCell>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatDate(user.created_at)}
        </span>
      </TableCell>
      <TableCell>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {user.last_login_at
            ? formatDateTime(user.last_login_at)
            : t("lastLoginNever")}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={onView}
          className="text-xs"
        >
          <Eye className="mr-1 h-3 w-3" />
          {t("view")}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default AdminUsers;
