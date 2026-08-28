import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  ClipboardList,
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
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  clearInviteToken,
  persistInviteToken,
  publicInviteUrl,
  readInviteToken,
} from "@/lib/inviteToken";

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
  const inviteFromUrl =
    searchParams.get("invite") ?? searchParams.get("token");
  persistInviteToken(inviteFromUrl);
  const inviteToken = inviteFromUrl || readInviteToken();

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
  const [copiedInviteUrl, setCopiedInviteUrl] = useState<string | null>(null);

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
    onSuccess: (created) => {
      setFormError(null);
      toast.success(t("inviteSent", { email: inviteEmail.trim() }));
      setInviteEmail("");
      if (created.token) {
        const url = publicInviteUrl(created.token);
        setCopiedInviteUrl(url);
        void navigator.clipboard?.writeText(url).catch(() => undefined);
      }
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
      clearInviteToken();
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
    <div className="w-full space-y-6">
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

      {orgId && (
        <Card data-testid="pilot-checklist">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm tracking-wide">
              <ClipboardList className="h-4 w-4 text-primary" />
              {t("pilotTitle")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("pilotDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
              <li>{t("pilotStepOrg")}</li>
              <li>{t("pilotStepInvite")}</li>
              <li>{t("pilotStepAssets")}</li>
              <li>{t("pilotStepSchedules")}</li>
              <li>{t("pilotStepCredits")}</li>
              <li>{t("pilotStepReport")}</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/assets" data-testid="pilot-link-assets">
                  {t("pilotLinkAssets")}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/schedules" data-testid="pilot-link-schedules">
                  {t("pilotLinkSchedules")}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/credit-history" data-testid="pilot-link-credits">
                  {t("pilotLinkCredits")}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 2xl:grid-cols-2">
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
                size="lg"
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

        {canManage && orgId ? (
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
            <CardContent className="space-y-3">
              {copiedInviteUrl && (
                <div
                  className="space-y-2 rounded-md border border-border bg-muted/40 p-3"
                  data-testid="invite-link-box"
                >
                  <p className="text-xs text-muted-foreground">
                    {t("inviteLinkHint")}
                  </p>
                  <p
                    className="break-all font-mono text-[11px] text-foreground"
                    data-testid="invite-link-url"
                  >
                    {copiedInviteUrl}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="copy-invite-link"
                    onClick={() => {
                      void navigator.clipboard
                        ?.writeText(copiedInviteUrl)
                        .then(() => toast.success(t("inviteLinkCopied")))
                        .catch(() => toast.error(t("inviteLinkCopyFail")));
                    }}
                  >
                    {t("copyInviteLink")}
                  </Button>
                </div>
              )}
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
                  size="lg"
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
        ) : (
          <div className="hidden 2xl:block" />
        )}
      </div>

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
            <TableRowSkeleton rows={3} />
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
            <ul className="space-y-2" data-testid="members-list">
              {membersQuery.data.map((m) => (
                <li
                  key={m.user_id}
                  className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:border-0 sm:px-0 sm:py-1"
                >
                  <p className="min-w-0 break-all text-sm text-foreground">
                    {m.email}
                  </p>
                  <Badge
                    variant={roleBadgeVariant(m.role)}
                    className="w-fit text-[10px] uppercase"
                  >
                    {m.role}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canManage && orgId && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm tracking-wide">
                {t("pendingInvites")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {invitesQuery.isLoading && <TableRowSkeleton rows={2} />}
              {invitesQuery.isError && (
                <p className="text-sm text-muted-foreground">
                  {t("invitesUnavailable")}
                </p>
              )}
              {invitesQuery.data && invitesQuery.data.length === 0 && (
                <div
                  className="flex min-h-[8rem] flex-col items-center justify-center gap-1 rounded-xl border border-border bg-muted/40 px-6 py-8 text-center"
                  data-testid="workspace-invites-empty"
                >
                  <p className="text-sm font-medium text-foreground">
                    {t("noPendingInvites")}
                  </p>
                  <p className="max-w-md text-xs text-muted-foreground">
                    {t("noPendingInvitesHint")}
                  </p>
                </div>
              )}
              {invitesQuery.data && invitesQuery.data.length > 0 && (
                <ul className="space-y-3" data-testid="invites-list">
                  {invitesQuery.data.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="break-all text-sm text-foreground">
                          {inv.email}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
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
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        data-testid={`revoke-invite-${inv.id}`}
                        className="w-full min-h-11 shrink-0 text-destructive hover:bg-destructive/10 sm:w-auto"
                        disabled={revokeMut.isPending}
                        onClick={() => revokeMut.mutate(inv.id)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        {t("revoke")}
                      </Button>
                    </li>
                  ))}
                </ul>
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
