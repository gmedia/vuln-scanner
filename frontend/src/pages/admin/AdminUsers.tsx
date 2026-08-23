import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Users, Search, Eye } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
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

function AdminUsers() {
  const { t } = useTranslation("admin");
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", page, search],
    queryFn: () =>
      adminApi.getUsers({ page, page_size: PAGE_SIZE, search: search || undefined }),
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-lg font-bold tracking-wide text-foreground">
            {t("usersTitle")}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {t("usersSubtitle")}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-sm tracking-wide">{t("usersCard")}</CardTitle>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder={t("searchEmail")}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="h-7 w-[180px] pl-7 text-xs"
              />
            </div>
            {data && data.total > 0 && (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {t("totalCount", { count: data.total })}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !data || data.users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 rounded-full bg-muted p-3">
                <Users className="h-6 w-6 text-muted-foreground opacity-40" />
              </div>
              <p className="text-sm text-foreground">{t("usersEmpty")}</p>
              <p className="text-xs text-muted-foreground">
                {search ? t("usersEmptySearch") : t("usersEmptyNone")}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    {t("colEmail")}
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    {t("colRole")}
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    {t("colVerified")}
                  </TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider">
                    {t("colCredits")}
                  </TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider">
                    {t("colScans")}
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    {t("colCreated")}
                  </TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider">
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
                  <span className="px-2 text-xs text-muted-foreground">
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
        </CardContent>
      </Card>
    </div>
  );
}

function UserRow({ user, onView }: { user: AdminUserItem; onView: () => void }) {
  const { t } = useTranslation("admin");
  return (
    <TableRow>
      <TableCell>
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
          className="text-[9px]"
        >
          {user.is_admin ? t("roleAdmin") : t("roleUser")}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge
          variant={user.is_verified ? "completed" : "pending"}
          className="text-[9px]"
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
