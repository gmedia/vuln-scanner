import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  Loader2,
  Mail,
  Receipt,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { buttonVariants } from "@/components/ui/buttonVariants";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuthStore } from "@/store/authStore";
import {
  acceptInvite,
  canManageMembers,
  createInvite,
  createOrg,
  downloadOrgInvoicePdf,
  listInvites,
  listMembers,
  listOrgInvoices,
  revokeInvite,
  type InviteRole,
  type OrgInvite,
  type OrgInvoiceItem,
  type OrgMember,
} from "@/api/orgs";
import { cn, type ApiError } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { WorkspaceInvoiceCard } from "@/components/invoice/WorkspaceInvoiceCard";
import {
  InvoicePrintSheet,
  useInvoicePrint,
} from "@/components/invoice/InvoicePrintSheet";
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

function roleLabel(role: string, t: (key: string) => string): string {
  if (role === "owner") return t("roleOwner");
  if (role === "admin") return t("roleAdmin");
  if (role === "member") return t("roleMember");
  if (role === "viewer") return t("roleViewer");
  return role;
}

function formatShortDate(iso: string | undefined, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale === "en" ? "en-US" : "id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function RoleBadge({ role }: { role: string }) {
  const { t } = useTranslation("workspace");
  return (
    <Badge
      variant={roleBadgeVariant(role)}
      className={
        role === "owner"
          ? "w-fit border-primary bg-primary text-[10px] uppercase text-primary-foreground"
          : "w-fit text-[10px] uppercase"
      }
    >
      {roleLabel(role, t)}
    </Badge>
  );
}

function StatTile({
  label,
  value,
  emphasize = false,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card px-4 py-3",
        emphasize && "ring-1 ring-primary/20",
      )}
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div
        className={cn(
          "mt-1 font-mono text-lg font-bold tabular-nums text-foreground",
          emphasize && "text-xl font-semibold tracking-tight sm:text-lg",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyIsland({
  icon: Icon,
  title,
  hint,
  testId,
  action,
}: {
  icon: typeof Users;
  title: string;
  hint?: string;
  testId?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-8 text-center"
      data-testid={testId}
    >
      <Icon className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint ? (
        <p className="max-w-md text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {action}
    </div>
  );
}

function WorkspaceSettings() {
  const { t, i18n } = useTranslation("workspace");
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const inviteFromUrl = searchParams.get("invite") ?? searchParams.get("token");
  persistInviteToken(inviteFromUrl);
  const inviteToken = inviteFromUrl || readInviteToken();
  const dateLocale = i18n.language === "en" ? "en" : "id";

  const organizations = useAuthStore((s) => s.organizations);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const activeRole = useAuthStore((s) => s.activeRole);
  const isPlatformAdmin = useAuthStore((s) => s.user?.is_admin === true);
  const loadOrganizations = useAuthStore((s) => s.loadOrganizations);
  const switchOrganization = useAuthStore((s) => s.switchOrganization);

  const orgId = activeOrgId ?? organizations[0]?.id ?? null;
  const role = activeRole();
  const canManage = canManageMembers(role);
  const { printing, startPrint } = useInvoicePrint();

  async function downloadPdf(inv: OrgInvoiceItem) {
    if (!orgId) return;
    try {
      await downloadOrgInvoicePdf(orgId, inv.id, inv.number);
    } catch {
      toast.error(t("invoicePdfFail"));
    }
  }

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

  const invoicesQuery = useQuery({
    queryKey: ["org-invoices", orgId],
    queryFn: () => listOrgInvoices(orgId!),
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

  const memberCount = membersQuery.data?.length;
  const pendingCount = invitesQuery.data?.length;
  const invoiceCount =
    invoicesQuery.data?.total ?? invoicesQuery.data?.items.length;
  const orgKind = activeOrg?.kind === "personal" ? t("kindPersonal") : t("kindTeam");

  return (
    <div className="w-full space-y-6">
      <PageHeader
        leading={<Building2 className="h-6 w-6 shrink-0 text-primary" />}
        title={t("title")}
        description={
          activeOrg
            ? t("roleLine", { name: activeOrg.name, role: activeOrg.role })
            : t("subtitleMembers")
        }
      />

      {inviteToken && (
        <Card
          data-testid="accept-invite-card"
          className="overflow-hidden ring-1 ring-primary/25"
        >
          <div
            aria-hidden
            className="h-1 w-full bg-linear-to-r from-primary/80 via-primary to-primary/40"
          />
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm tracking-wide">
              <Mail className="h-4 w-4 text-primary" />
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

      {!orgId && (
        <CreateOrgCard
          name={newOrgName}
          slug={newOrgSlug}
          error={createError}
          pending={createOrgMut.isPending}
          onName={setNewOrgName}
          onSlug={setNewOrgSlug}
          onSubmit={onCreateOrg}
        />
      )}

      {orgId && activeOrg && (
        <Card className="overflow-hidden border-border">
          <div
            aria-hidden
            className="h-1 w-full bg-linear-to-r from-primary/80 via-primary to-primary/40"
          />
          <CardHeader className="gap-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t("currentOrg")}
                </p>
                <CardTitle className="text-base tracking-tight">
                  {activeOrg.name}
                </CardTitle>
                <p className="font-mono text-xs text-muted-foreground">
                  {activeOrg.slug}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <RoleBadge role={activeOrg.role} />
                <Badge variant="default" className="text-[10px] uppercase">
                  {orgKind}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatTile
                label={t("statMembers")}
                value={
                  membersQuery.isLoading ? "…" : String(memberCount ?? "—")
                }
                emphasize
              />
              <StatTile
                label={t("statInvites")}
                value={
                  canManage
                    ? invitesQuery.isLoading
                      ? "…"
                      : String(pendingCount ?? "—")
                    : "—"
                }
              />
              <StatTile
                label={t("statInvoices")}
                value={
                  canManage
                    ? invoicesQuery.isLoading
                      ? "…"
                      : String(invoiceCount ?? "—")
                    : "—"
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div
        className={
          canManage && orgId
            ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start"
            : undefined
        }
      >
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <CardTitle className="flex items-center gap-2 text-sm tracking-wide">
                  <Users className="h-4 w-4 text-primary" />
                  {t("membersTitle")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("membersDescription")}
                </CardDescription>
              </div>
              {typeof memberCount === "number" && memberCount > 0 ? (
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {t("membersCount", { count: memberCount })}
                </span>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {!orgId && (
              <EmptyIsland
                icon={Building2}
                title={t("noOrgYet")}
                hint={t("noOrgYetHint")}
              />
            )}
            {orgId && membersQuery.isLoading && <TableRowSkeleton rows={3} />}
            {orgId && membersQuery.isError && (
              <p className="text-sm text-muted-foreground" role="status">
                {t("membersUnavailable")}
              </p>
            )}
            {membersQuery.data && membersQuery.data.length === 0 && (
              <EmptyIsland icon={Users} title={t("noMembers")} />
            )}
            {membersQuery.data && membersQuery.data.length > 0 && (
              <MembersList
                members={membersQuery.data}
                dateLocale={dateLocale}
              />
            )}
          </CardContent>
        </Card>

        {canManage && orgId ? (
          <Card data-testid="invite-form-card" className="xl:sticky xl:top-6">
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
                <div className="grid gap-3">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="invite-email">{t("colEmail")}</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      data-testid="invite-email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder={t("emailPlaceholder")}
                      required
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="invite-role">{t("inviteRole")}</Label>
                    <Select
                      value={inviteRole}
                      onValueChange={(v) => setInviteRole(v as InviteRole)}
                    >
                      <SelectTrigger id="invite-role" data-testid="invite-role">
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
                  className="w-full"
                  data-testid="invite-submit"
                  disabled={inviteMut.isPending}
                >
                  {inviteMut.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  <UserPlus className="mr-2 h-4 w-4" />
                  {t("sendInvite")}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {canManage && orgId && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-sm tracking-wide">
                <Mail className="h-4 w-4 text-primary" />
                {t("pendingInvites")}
              </CardTitle>
              {typeof pendingCount === "number" && pendingCount > 0 ? (
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {t("invitesCount", { count: pendingCount })}
                </span>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {invitesQuery.isLoading && <TableRowSkeleton rows={2} />}
            {invitesQuery.isError && (
              <p className="text-sm text-muted-foreground">
                {t("invitesUnavailable")}
              </p>
            )}
            {invitesQuery.data && invitesQuery.data.length === 0 && (
              <EmptyIsland
                icon={Mail}
                title={t("noPendingInvites")}
                hint={t("noPendingInvitesHint")}
                testId="workspace-invites-empty"
              />
            )}
            {invitesQuery.data && invitesQuery.data.length > 0 && (
              <InvitesList
                invites={invitesQuery.data}
                dateLocale={dateLocale}
                pending={revokeMut.isPending}
                onRevoke={(id) => revokeMut.mutate(id)}
              />
            )}
          </CardContent>
        </Card>
      )}

      {orgId && canManage && (
        <Card data-testid="workspace-billing">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm tracking-wide">
              <Receipt className="h-4 w-4 text-primary" />
              {t("billingTitle")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("billingDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {invoicesQuery.isLoading ? (
              <TableRowSkeleton rows={2} />
            ) : invoicesQuery.isError ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="workspace-billing-error"
              >
                {t("billingLoadError")}
              </p>
            ) : (invoicesQuery.data?.items.length ?? 0) === 0 ? (
              <EmptyIsland
                icon={Receipt}
                title={t("billingEmpty")}
                testId="workspace-billing-empty"
                action={
                  isPlatformAdmin ? (
                    <Button asChild variant="outline" size="sm">
                      <Link
                        to="/admin/invoices"
                        data-testid="workspace-billing-admin-link"
                      >
                        {t("billingAdminLink")}
                      </Link>
                    </Button>
                  ) : null
                }
              />
            ) : (
              <ul
                className="grid gap-3 lg:grid-cols-2"
                data-testid="workspace-billing-list"
              >
                {invoicesQuery.data?.items.map((inv) => (
                  <WorkspaceInvoiceCard
                    key={inv.id}
                    invoice={inv}
                    onPrint={() => startPrint(inv)}
                    onDownload={() => void downloadPdf(inv)}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {orgId && (
        <Card data-testid="pilot-checklist">
          <Accordion type="single" collapsible>
            <AccordionItem value="pilot" className="border-0">
              <AccordionTrigger className="px-4 py-4 hover:no-underline">
                <span className="flex items-center gap-2 text-sm font-medium tracking-wide text-foreground">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  {t("pilotTitle")}
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4">
                <p className="mb-4 text-xs text-muted-foreground">
                  {t("pilotDescription")}
                </p>
                <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
                  <li>{t("pilotStepOrg")}</li>
                  <li>{t("pilotStepInvite")}</li>
                  <li>{t("pilotStepAssets")}</li>
                  <li>{t("pilotStepSchedules")}</li>
                  <li>{t("pilotStepReport")}</li>
                </ol>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:flex-wrap">
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
          </div>
        </Card>
      )}

      {orgId ? (
        <CreateOrgCard
          name={newOrgName}
          slug={newOrgSlug}
          error={createError}
          pending={createOrgMut.isPending}
          onName={setNewOrgName}
          onSlug={setNewOrgSlug}
          onSubmit={onCreateOrg}
        />
      ) : null}

      {!canManage && orgId && role && (
        <p className="text-xs text-muted-foreground">{t("onlyAdminsInvite")}</p>
      )}
      <InvoicePrintSheet invoice={printing} billTo={activeOrg?.name} />
    </div>
  );
}

function CreateOrgCard({
  name,
  slug,
  error,
  pending,
  onName,
  onSlug,
  onSubmit,
}: {
  name: string;
  slug: string;
  error: string | null;
  pending: boolean;
  onName: (v: string) => void;
  onSlug: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const { t } = useTranslation("workspace");
  return (
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
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="org-name">{t("orgName")}</Label>
              <Input
                id="org-name"
                data-testid="create-org-name"
                value={name}
                onChange={(e) => onName(e.target.value)}
                placeholder={t("orgNamePlaceholder")}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="org-slug">{t("orgSlug")}</Label>
              <Input
                id="org-slug"
                data-testid="create-org-slug"
                value={slug}
                onChange={(e) => onSlug(e.target.value)}
                placeholder={t("orgSlugPlaceholder")}
              />
            </div>
          </div>
          {error && (
            <Alert variant="destructive" className="border-destructive/40">
              <AlertTriangle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            type="submit"
            size="lg"
            data-testid="create-org-submit"
            disabled={pending}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("createWorkspace")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MembersList({
  members,
  dateLocale,
}: {
  members: OrgMember[];
  dateLocale: string;
}) {
  const { t } = useTranslation("workspace");
  return (
    <div data-testid="members-list">
      <div className="space-y-2 md:hidden">
        {members.map((m) => (
          <div
            key={m.user_id}
            className="rounded-lg border border-border bg-card p-3"
          >
            <p className="break-all font-mono text-xs text-foreground">
              {m.email}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RoleBadge role={m.role} />
              <span className="font-mono text-[11px] text-muted-foreground">
                {formatShortDate(m.joined_at, dateLocale)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden md:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[55%] text-[10px] uppercase tracking-wider">
                {t("colEmail")}
              </TableHead>
              <TableHead className="w-[20%] text-[10px] uppercase tracking-wider">
                {t("colRole")}
              </TableHead>
              <TableHead className="w-[25%] text-[10px] uppercase tracking-wider">
                {t("colJoined")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.user_id}>
                <TableCell>
                  <span
                    className="block max-w-[min(36rem,50vw)] truncate font-mono text-xs text-foreground 2xl:max-w-none 2xl:overflow-visible 2xl:whitespace-normal"
                    title={m.email}
                  >
                    {m.email}
                  </span>
                </TableCell>
                <TableCell>
                  <RoleBadge role={m.role} />
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {formatShortDate(m.joined_at, dateLocale)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function InvitesList({
  invites,
  dateLocale,
  pending,
  onRevoke,
}: {
  invites: OrgInvite[];
  dateLocale: string;
  pending: boolean;
  onRevoke: (id: string) => void;
}) {
  const { t } = useTranslation("workspace");
  return (
    <div data-testid="invites-list">
      <div className="space-y-2 md:hidden">
        {invites.map((inv) => (
          <div
            key={inv.id}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3"
          >
            <div className="min-w-0 space-y-1">
              <p className="break-all font-mono text-xs text-foreground">
                {inv.email}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <RoleBadge role={inv.role} />
                {inv.expires_at ? (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {t("expires", {
                      date: formatShortDate(inv.expires_at, dateLocale),
                    })}
                  </span>
                ) : null}
              </div>
            </div>
            <RevokeInviteButton
              inviteId={inv.id}
              pending={pending}
              onRevoke={onRevoke}
            />
          </div>
        ))}
      </div>
      <div className="hidden md:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[45%] text-[10px] uppercase tracking-wider">
                {t("colEmail")}
              </TableHead>
              <TableHead className="w-[18%] text-[10px] uppercase tracking-wider">
                {t("colRole")}
              </TableHead>
              <TableHead className="w-[22%] text-[10px] uppercase tracking-wider">
                {t("colExpires")}
              </TableHead>
              <TableHead className="w-[15%] text-right text-[10px] uppercase tracking-wider">
                {t("colAction")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell>
                  <span
                    className="block max-w-[min(36rem,50vw)] truncate font-mono text-xs text-foreground 2xl:max-w-none 2xl:overflow-visible 2xl:whitespace-normal"
                    title={inv.email}
                  >
                    {inv.email}
                  </span>
                </TableCell>
                <TableCell>
                  <RoleBadge role={inv.role} />
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {inv.expires_at
                      ? formatShortDate(inv.expires_at, dateLocale)
                      : "—"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <RevokeInviteButton
                    inviteId={inv.id}
                    pending={pending}
                    onRevoke={onRevoke}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RevokeInviteButton({
  inviteId,
  pending,
  onRevoke,
}: {
  inviteId: string;
  pending: boolean;
  onRevoke: (id: string) => void;
}) {
  const { t } = useTranslation("workspace");
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid={`revoke-invite-${inviteId}`}
          className="w-full min-h-11 shrink-0 text-destructive hover:bg-destructive/10 sm:w-auto"
          disabled={pending}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          {t("revoke")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("revokeConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("revokeConfirmBody")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            onClick={() => onRevoke(inviteId)}
          >
            {t("revoke")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default WorkspaceSettings;
