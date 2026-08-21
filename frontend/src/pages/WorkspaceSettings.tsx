import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  Loader2,
  Mail,
  Trash2,
  UserPlus,
  Users,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { useAuthStore } from "@/store/authStore";
import {
  acceptInvite,
  canManageMembers,
  createInvite,
  createOrg,
  listInvites,
  listMembers,
  revokeInvite,
  type InviteRole,
} from "@/api/orgs";
import type { ApiError } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

function apiDetail(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const detail = (err as ApiError).response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

function roleBadgeVariant(
  role: string,
): "default" | "info" | "low" | "success" {
  if (role === "owner") return "default";
  if (role === "admin") return "success";
  if (role === "viewer") return "info";
  return "low";
}

function WorkspaceSettings() {
  const { t, i18n } = useTranslation("workspace");
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite") ?? searchParams.get("token");

  const organizations = useAuthStore((s) => s.organizations);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const activeRole = useAuthStore((s) => s.activeRole);
  const loadOrganizations = useAuthStore((s) => s.loadOrganizations);
  const switchOrganization = useAuthStore((s) => s.switchOrganization);

  const orgId = activeOrgId ?? organizations[0]?.id ?? null;
  const role = activeRole();
  const canManage = canManageMembers(role);

  const activeOrg = useMemo(
    () => organizations.find((o) => o.id === orgId),
    [organizations, orgId],
  );

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("member");
  const [formError, setFormError] = useState<string | null>(null);

  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [acceptError, setAcceptError] = useState<string | null>(null);

  const membersQuery = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => listMembers(orgId!),
    enabled: !!orgId,
    retry: false,
  });

  const invitesQuery = useQuery({
    queryKey: ["org-invites", orgId],
    queryFn: () => listInvites(orgId!),
    enabled: !!orgId && canManage,
    retry: false,
  });

  const inviteMut = useMutation({
    mutationFn: () =>
      createInvite(orgId!, {
        email: inviteEmail.trim(),
        role: inviteRole,
      }),
    onSuccess: () => {
      setFormError(null);
      toast.success(t("inviteSent", { email: inviteEmail.trim() }));
      setInviteEmail("");
      void qc.invalidateQueries({ queryKey: ["org-invites", orgId] });
    },
    onError: (err: unknown) => {
      setFormError(apiDetail(err, t("inviteFail")));
    },
  });

  const revokeMut = useMutation({
    mutationFn: (inviteId: string) => revokeInvite(orgId!, inviteId),
    onSuccess: () => {
      toast.success(t("inviteRevoked"));
      void qc.invalidateQueries({ queryKey: ["org-invites", orgId] });
    },
    onError: (err: unknown) => {
      setFormError(apiDetail(err, t("revokeFail")));
    },
  });

  const createOrgMut = useMutation({
    mutationFn: () =>
      createOrg({
        name: newOrgName.trim(),
        slug: newOrgSlug.trim() || undefined,
      }),
    onSuccess: async (org) => {
      setCreateError(null);
      setNewOrgName("");
      setNewOrgSlug("");
      toast.success(t("orgCreated"));
      await loadOrganizations();
      await switchOrganization(org.id);
      void qc.invalidateQueries();
    },
    onError: (err: unknown) => {
      setCreateError(apiDetail(err, t("orgCreateFail")));
    },
  });

  const acceptMut = useMutation({
    mutationFn: (token: string) => acceptInvite(token),
    onSuccess: async (res) => {
      setAcceptError(null);
      toast.success(res.message ?? t("acceptSuccess"));
      setSearchParams({});
      await loadOrganizations();
      if (res.organization_id) {
        await switchOrganization(res.organization_id);
      }
      void qc.invalidateQueries();
    },
    onError: (err: unknown) => {
      setAcceptError(apiDetail(err, t("acceptFail")));
    },
  });

  function onInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!inviteEmail.trim()) {
      setFormError(t("emailRequired"));
      return;
    }
    if (!orgId) {
      setFormError(t("noActiveWorkspace"));
      return;
    }
    inviteMut.mutate();
  }

  function onCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!newOrgName.trim()) {
      setCreateError(t("orgNameRequired"));
      return;
    }
    createOrgMut.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/dashboard"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Users className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-lg font-bold tracking-wide text-foreground">
            {t("title")}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {activeOrg
              ? t("roleLine", { name: activeOrg.name, role: activeOrg.role })
              : t("subtitleMembers")}
          </p>
        </div>
      </div>

      {inviteToken && (
        <Card data-testid="accept-invite-card">
          <CardHeader>
            <CardTitle className="text-sm tracking-wide">
              {t("acceptTitle")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("acceptDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {acceptError && (
              <Alert variant="destructive" className="border-destructive/40">
                <AlertTriangle />
                <AlertDescription>{acceptError}</AlertDescription>
              </Alert>
            )}
            <Button
              type="button"
              data-testid="accept-invite-btn"
              disabled={acceptMut.isPending}
              onClick={() => acceptMut.mutate(inviteToken)}
            >
              {acceptMut.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("acceptButton")}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm tracking-wide">
            <Building2 className="h-4 w-4 text-primary" />
            {t("createOrgTitle")}
          </CardTitle>
          <CardDescription className="text-xs">
            {t("createOrgDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreateOrg} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="org-name">{t("orgName")}</Label>
                <Input
                  id="org-name"
                  data-testid="create-org-name"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="Hotel Example"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-slug">{t("orgSlug")}</Label>
                <Input
                  id="org-slug"
                  data-testid="create-org-slug"
                  value={newOrgSlug}
                  onChange={(e) => setNewOrgSlug(e.target.value)}
                  placeholder="hotel-example"
                />
              </div>
            </div>
            {createError && (
              <Alert variant="destructive" className="border-destructive/40">
                <AlertTriangle />
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            )}
            <Button
              type="submit"
              data-testid="create-org-submit"
              disabled={createOrgMut.isPending}
            >
              {createOrgMut.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("createWorkspace")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">
            {t("membersTitle")}
          </CardTitle>
          <CardDescription className="text-xs">
            {t("membersDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!orgId && (
            <p className="text-sm text-muted-foreground">{t("noOrgYet")}</p>
          )}
          {orgId && membersQuery.isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          )}
          {orgId && membersQuery.isError && (
            <p className="text-sm text-muted-foreground" role="status">
              {t("membersUnavailable")}
            </p>
          )}
          {membersQuery.data && membersQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("noMembers")}</p>
          )}
          {membersQuery.data && membersQuery.data.length > 0 && (
            <Table className="text-sm" data-testid="members-list">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    {t("colEmail")}
                  </TableHead>
                  <TableHead className="w-[28%] text-right text-[10px] uppercase tracking-wider">
                    {t("colRole")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {membersQuery.data.map((m) => (
                  <TableRow key={m.user_id}>
                    <TableCell className="truncate text-foreground">
                      {m.email}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={roleBadgeVariant(m.role)}
                        className="text-[10px] uppercase"
                      >
                        {m.role}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canManage && orgId && (
        <>
          <Card data-testid="invite-form-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm tracking-wide">
                <UserPlus className="h-4 w-4 text-primary" />
                {t("inviteTitle")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("inviteDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onInviteSubmit} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="invite-email">{t("colEmail")}</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      data-testid="invite-email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="colleague@example.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("inviteRole")}</Label>
                    <Select
                      value={inviteRole}
                      onValueChange={(v) => setInviteRole(v as InviteRole)}
                    >
                      <SelectTrigger data-testid="invite-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">{t("roleAdmin")}</SelectItem>
                        <SelectItem value="member">
                          {t("roleMember")}
                        </SelectItem>
                        <SelectItem value="viewer">
                          {t("roleViewer")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {formError && (
                  <Alert
                    variant="destructive"
                    className="border-destructive/40"
                  >
                    <AlertTriangle />
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}
                <Button
                  type="submit"
                  data-testid="invite-submit"
                  disabled={inviteMut.isPending}
                >
                  {inviteMut.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  <Mail className="mr-2 h-4 w-4" />
                  {t("sendInvite")}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm tracking-wide">
                {t("pendingInvites")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {invitesQuery.isLoading && <Skeleton className="h-8 w-full" />}
              {invitesQuery.isError && (
                <p className="text-sm text-muted-foreground">
                  {t("invitesUnavailable")}
                </p>
              )}
              {invitesQuery.data && invitesQuery.data.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("noPendingInvites")}
                </p>
              )}
              {invitesQuery.data && invitesQuery.data.length > 0 && (
                <Table className="text-sm" data-testid="invites-list">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("colEmail")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("colRole")}
                      </TableHead>
                      <TableHead className="w-[1%] text-right text-[10px] uppercase tracking-wider">
                        {t("colAction")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitesQuery.data.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="min-w-0">
                          <p className="truncate text-foreground">
                            {inv.email}
                          </p>
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground">
                          {inv.role}
                          {inv.expires_at
                            ? ` · ${t("expires", {
                                date: new Date(
                                  inv.expires_at,
                                ).toLocaleDateString(
                                  i18n.language === "en" ? "en-US" : "id-ID",
                                ),
                              })}`
                            : ""}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-testid={`revoke-invite-${inv.id}`}
                            className="text-destructive hover:bg-destructive/10"
                            disabled={revokeMut.isPending}
                            onClick={() => revokeMut.mutate(inv.id)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            {t("revoke")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!canManage && orgId && role && (
        <p className="text-xs text-muted-foreground">{t("onlyAdminsInvite")}</p>
      )}
    </div>
  );
}

export default WorkspaceSettings;
