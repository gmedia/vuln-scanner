import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Users, Search, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { adminApi } from "@/api/admin";
import type { AdminUserItem } from "@/api/admin";

const PAGE_SIZE = 20;

function AdminUsers() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", page, search],
    queryFn: () => adminApi.getUsers({ page, page_size: PAGE_SIZE, search: search || undefined }),
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <h2 className="font-mono text-lg font-bold tracking-wide text-foreground">
          USER MANAGEMENT
        </h2>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="font-mono text-sm tracking-wide">
            USERS
          </CardTitle>
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
                className="h-7 w-[180px] pl-7 text-xs font-mono"
              />
            </div>
            {data && data.total > 0 && (
              <span className="font-mono text-[10px] text-muted-foreground shrink-0">
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
              <p className="font-mono text-sm text-foreground">
                No users found
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {search ? "Try a different search term." : "No users registered yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Email
                    </th>
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Admin
                    </th>
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Verified
                    </th>
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Credits
                    </th>
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Scans
                    </th>
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Created
                    </th>
                    <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data?.users.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      onView={() => navigate(`/admin/users/${user.id}`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!isLoading && totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="font-mono text-xs"
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span className="font-mono text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="font-mono text-xs"
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UserRow({ user, onView }: { user: AdminUserItem; onView: () => void }) {
  return (
    <tr className="group transition-colors hover:bg-muted/50">
      <td className="px-3 py-3">
        <span className="font-mono text-xs text-foreground truncate max-w-[200px] block">
          {user.email}
        </span>
      </td>
      <td className="px-3 py-3">
        <Badge
          variant={user.is_admin ? "completed" : "default"}
          className="text-[9px] capitalize"
        >
          {user.is_admin ? "Yes" : "No"}
        </Badge>
      </td>
      <td className="px-3 py-3">
        <Badge
          variant={user.is_verified ? "completed" : "default"}
          className="text-[9px] capitalize"
        >
          {user.is_verified ? "Yes" : "No"}
        </Badge>
      </td>
      <td className="px-3 py-3">
        <span className="font-mono text-xs text-foreground">
          {user.credits}
        </span>
      </td>
      <td className="px-3 py-3">
        <span className="font-mono text-xs text-muted-foreground">
          {user.scan_count}
        </span>
      </td>
      <td className="px-3 py-3">
        <span className="font-mono text-xs text-muted-foreground">
          {new Date(user.created_at).toLocaleDateString()}
        </span>
      </td>
      <td className="px-3 py-3 text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={onView}
          className="font-mono text-xs opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Eye className="h-3 w-3 mr-1" />
          View
        </Button>
      </td>
    </tr>
  );
}

export default AdminUsers;
