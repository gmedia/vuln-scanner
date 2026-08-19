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

const PAGE_SIZE = 20;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function AdminUsers() {
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
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-lg font-bold tracking-wide text-foreground">
            User management
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Search and manage registered accounts
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-sm tracking-wide">Users</CardTitle>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search email..."
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
                {data.total} total
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
              <p className="text-sm text-foreground">No users found</p>
              <p className="text-xs text-muted-foreground">
                {search ? "Try a different search term." : "No users registered yet."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    Email
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    Role
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    Verified
                  </TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider">
                    Credits
                  </TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider">
                    Scans
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    Created
                  </TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider">
                    Actions
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
                    Page {page} of {totalPages}
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
  return (
    <TableRow>
      <TableCell>
        <span
          className="block max-w-[200px] truncate font-mono text-xs text-foreground"
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
          {user.is_admin ? "Admin" : "User"}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge
          variant={user.is_verified ? "completed" : "pending"}
          className="text-[9px]"
        >
          {user.is_verified ? "Verified" : "Unverified"}
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
          View
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default AdminUsers;
