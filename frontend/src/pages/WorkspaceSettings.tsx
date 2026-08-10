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
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [acceptMsg, setAcceptMsg] = useState<string | null>(null);
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
      setFormSuccess(`Undangan dikirim ke ${inviteEmail.trim()}`);
      setInviteEmail("");
      void qc.invalidateQueries({ queryKey: ["org-invites", orgId] });
    },
    onError: (err: unknown) => {
      setFormSuccess(null);
      setFormError(apiDetail(err, "Gagal mengirim undangan"));
    },
  });

  const revokeMut = useMutation({
    mutationFn: (inviteId: string) => revokeInvite(orgId!, inviteId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["org-invites", orgId] });
    },
    onError: (err: unknown) => {
      setFormError(apiDetail(err, "Gagal mencabut undangan"));
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
      await loadOrganizations();
      await switchOrganization(org.id);
      void qc.invalidateQueries();
    },
    onError: (err: unknown) => {
      setCreateError(apiDetail(err, "Gagal membuat organisasi"));
    },
  });

  const acceptMut = useMutation({
    mutationFn: (token: string) => acceptInvite(token),
    onSuccess: async (res) => {
      setAcceptError(null);
      setAcceptMsg(res.message ?? "Undangan diterima");
      setSearchParams({});
      await loadOrganizations();
      if (res.organization_id) {
        await switchOrganization(res.organization_id);
      }
      void qc.invalidateQueries();
    },
    onError: (err: unknown) => {
      setAcceptMsg(null);
      setAcceptError(apiDetail(err, "Gagal menerima undangan"));
    },
  });

  function onInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormSuccess(null);
    setFormError(null);
    if (!inviteEmail.trim()) {
      setFormError("Email wajib diisi");
      return;
    }
    if (!orgId) {
      setFormError("Tidak ada workspace aktif");
      return;
    }
    inviteMut.mutate();
  }

  function onCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!newOrgName.trim()) {
      setCreateError("Nama organisasi wajib");
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
            Workspace
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {activeOrg
              ? `${activeOrg.name} · peran ${activeOrg.role}`
              : "Anggota, undangan, dan organisasi"}
          </p>
        </div>
      </div>

      {inviteToken && (
        <Card data-testid="accept-invite-card">
          <CardHeader>
            <CardTitle className="text-sm tracking-wide">
              Terima undangan
            </CardTitle>
            <CardDescription className="text-xs">
              Token undangan terdeteksi di URL.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {acceptMsg && (
              <p className="text-sm text-primary" role="status">
                {acceptMsg}
              </p>
            )}
            {acceptError && (
              <p className="text-sm text-destructive" role="alert">
                {acceptError}
              </p>
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
              Terima undangan
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm tracking-wide">
            <Building2 className="h-4 w-4 text-primary" />
            Buat organisasi
          </CardTitle>
          <CardDescription className="text-xs">
            Workspace hotel/perusahaan (bukan personal). Anda menjadi owner.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreateOrg} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="org-name">Nama</Label>
                <Input
                  id="org-name"
                  data-testid="create-org-name"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="Hotel Example"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-slug">Slug (opsional)</Label>
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
              <p className="text-sm text-destructive" role="alert">
                {createError}
              </p>
            )}
            <Button
              type="submit"
              data-testid="create-org-submit"
              disabled={createOrgMut.isPending}
            >
              {createOrgMut.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Buat workspace
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">Anggota</CardTitle>
          <CardDescription className="text-xs">
            Daftar membership di workspace aktif.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!orgId && (
            <p className="text-sm text-muted-foreground">
              Belum ada organisasi. Buat workspace atau tunggu backend workspace
              aktif.
            </p>
          )}
          {orgId && membersQuery.isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          )}
          {orgId && membersQuery.isError && (
            <p className="text-sm text-muted-foreground" role="status">
              Anggota belum tersedia (API workspace mungkin belum live).
            </p>
          )}
          {membersQuery.data && membersQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Belum ada anggota.</p>
          )}
          {membersQuery.data && membersQuery.data.length > 0 && (
            <ul className="divide-y divide-border" data-testid="members-list">
              {membersQuery.data.map((m) => (
                <li
                  key={m.user_id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <span className="truncate text-foreground">{m.email}</span>
                  <Badge
                    variant={roleBadgeVariant(m.role)}
                    className="text-[10px] uppercase"
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
          <Card data-testid="invite-form-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm tracking-wide">
                <UserPlus className="h-4 w-4 text-primary" />
                Undang anggota
              </CardTitle>
              <CardDescription className="text-xs">
                Role: admin, member, atau viewer (bukan owner).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onInviteSubmit} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="invite-email">Email</Label>
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
                    <Label>Peran</Label>
                    <Select
                      value={inviteRole}
                      onValueChange={(v) => setInviteRole(v as InviteRole)}
                    >
                      <SelectTrigger data-testid="invite-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {formError && (
                  <p className="text-sm text-destructive" role="alert">
                    {formError}
                  </p>
                )}
                {formSuccess && (
                  <p className="text-sm text-primary" role="status">
                    {formSuccess}
                  </p>
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
                  Kirim undangan
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm tracking-wide">
                Undangan tertunda
              </CardTitle>
            </CardHeader>
            <CardContent>
              {invitesQuery.isLoading && <Skeleton className="h-8 w-full" />}
              {invitesQuery.isError && (
                <p className="text-sm text-muted-foreground">
                  Daftar undangan belum tersedia.
                </p>
              )}
              {invitesQuery.data && invitesQuery.data.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Tidak ada undangan tertunda.
                </p>
              )}
              {invitesQuery.data && invitesQuery.data.length > 0 && (
                <ul
                  className="divide-y divide-border"
                  data-testid="invites-list"
                >
                  {invitesQuery.data.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-foreground">{inv.email}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {inv.role}
                          {inv.expires_at
                            ? ` · exp ${new Date(inv.expires_at).toLocaleDateString("id-ID")}`
                            : ""}
                        </p>
                      </div>
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
                        Cabut
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
        <p className="text-xs text-muted-foreground">
          Hanya owner/admin yang dapat mengundang anggota.
        </p>
      )}
    </div>
  );
}

export default WorkspaceSettings;
