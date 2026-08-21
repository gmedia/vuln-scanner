import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, RefreshCw, KeyRound, AlertTriangle } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
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
import {
  canManageGuard,
  createEnrollToken,
  enableGuard,
  getGuardStatus,
  listEnrollTokens,
  listGuardAgents,
  listGuardAlerts,
  revokeEnrollToken,
  syncGuard,
} from "@/api/guard";
import { useAuthStore } from "@/store/authStore";
import type { ApiError } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  buildEnrollCurlExample,
  GUARD_AGENT_INSTALL_INTRO,
  GUARD_AGENT_INSTALL_STEPS,
  GUARD_DISTRO_INSTALL_FOOTER,
  GUARD_DISTRO_INSTALL_GUIDES,
  GUARD_HOST_SETUP_STEPS,
  resolveApiBaseUrl,
} from "@/lib/guardEnrollHost";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function apiDetail(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const detail = (err as ApiError).response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

function statusBadge(status: string, t: (key: string) => string) {
  const s = status.toLowerCase();
  if (s === "active")
    return (
      <Badge className="bg-emerald-500/15 text-emerald-600">
        {t("online")}
      </Badge>
    );
  if (s === "disconnected")
    return (
      <Badge className="bg-amber-500/15 text-amber-700">
        {t("disconnected")}
      </Badge>
    );
  if (s === "pending")
    return <Badge className="bg-sky-500/15 text-sky-700">{t("pending")}</Badge>;
  return <Badge variant="info">{status}</Badge>;
}

export default function Guard() {
  const { t } = useTranslation("guard");
  const queryClient = useQueryClient();
  const activeRole = useAuthStore((s) => s.activeRole);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const canAdmin = canManageGuard(activeRole());
  const [tokenLabel, setTokenLabel] = useState("");
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [curlCopied, setCurlCopied] = useState(false);
  const [showAllTokens, setShowAllTokens] = useState(false);
  const [showTechDetails, setShowTechDetails] = useState(false);

  const apiBase = resolveApiBaseUrl(
    import.meta.env.VITE_API_URL as string | undefined,
    typeof window !== "undefined" ? window.location.origin : undefined,
  );
  const enrollCurl = buildEnrollCurlExample(
    apiBase,
    rawToken ?? "<ENROLL_TOKEN>",
    "<AGENT_NAME>",
  );

  const statusQ = useQuery({
    queryKey: ["guard", activeOrgId, "status"],
    queryFn: getGuardStatus,
    enabled: !!activeOrgId,
  });
  const agentsQ = useQuery({
    queryKey: ["guard", activeOrgId, "agents"],
    queryFn: listGuardAgents,
    enabled: !!activeOrgId && !!statusQ.data?.enabled,
  });
  const alertsQ = useQuery({
    queryKey: ["guard", activeOrgId, "alerts"],
    queryFn: () => listGuardAlerts(50),
    enabled: !!activeOrgId && !!statusQ.data?.enabled,
  });
  const tokensQ = useQuery({
    queryKey: ["guard", activeOrgId, "tokens"],
    queryFn: listEnrollTokens,
    enabled: !!activeOrgId && !!statusQ.data?.enabled && canAdmin,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["guard"] });
  };

  const enableMut = useMutation({
    mutationFn: enableGuard,
    onSuccess: () => {
      setActionError(null);
      toast.success(t("enabledToast"));
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, t("enableFail"))),
  });

  const syncMut = useMutation({
    mutationFn: syncGuard,
    onSuccess: () => {
      setActionError(null);
      toast.success(t("syncDone"));
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, t("syncFail"))),
  });

  const tokenMut = useMutation({
    mutationFn: () => createEnrollToken(tokenLabel.trim() || undefined),
    onSuccess: (data) => {
      setRawToken(data.token);
      setTokenLabel("");
      setActionError(null);
      toast.success(t("tokenCreated"));
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, t("tokenCreateFail"))),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeEnrollToken(id),
    onSuccess: () => {
      setActionError(null);
      toast.success(t("tokenRevoked"));
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, t("tokenRevokeFail"))),
  });

  const enabled = statusQ.data?.enabled ?? false;

  const tokens = tokensQ.data ?? [];
  const sortedTokens = [...tokens].sort((a, b) => {
    const rank = (t: (typeof tokens)[number]) =>
      t.revoked_at ? 2 : t.used_at ? 1 : 0;
    return rank(a) - rank(b);
  });
  const visibleTokens = showAllTokens ? sortedTokens : sortedTokens.slice(0, 5);
  const unusedCount = tokens.filter((t) => !t.revoked_at && !t.used_at).length;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="mb-2 py-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Shield className="h-6 w-6 text-primary" />
              {t("title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
          {canAdmin && !enabled && (
            <Button
              onClick={() => enableMut.mutate()}
              disabled={enableMut.isPending}
            >
              {t("enable")}
            </Button>
          )}
        </div>
      </div>

      {actionError && (
        <Alert variant="destructive" className="border-destructive/40">
          <AlertTriangle />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6 text-sm">
          {statusQ.isLoading ? (
            <Skeleton className="h-6 w-48" />
          ) : statusQ.isError ? (
            <p className="text-destructive">{t("loadStatusFail")}</p>
          ) : (
            <>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span
                  data-testid="guard-state"
                  data-enabled={enabled ? "true" : "false"}
                >
                  {t("guardState")}{" "}
                  <strong>{enabled ? t("enabledOn") : t("enabledOff")}</strong>
                </span>
                {statusQ.data?.degraded && (
                  <Badge className="bg-amber-500/15 text-amber-800">
                    {t("degraded")}
                  </Badge>
                )}
                {enabled && (
                  <span className="text-muted-foreground">
                    {t("criticalAlertsCount", {
                      count: alertsQ.data?.length ?? 0,
                    })}
                  </span>
                )}
                <span className="text-muted-foreground">
                  {t("syncAt", {
                    when: formatWhen(
                      statusQ.data?.last_inventory_sync_at ?? null,
                    ),
                  })}
                </span>
                {statusQ.data?.last_sync_error && (
                  <span className="text-amber-700 dark:text-amber-400">
                    {statusQ.data.last_sync_error}
                  </span>
                )}
                {statusQ.data?.wazuh_group && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-0 text-xs text-muted-foreground"
                    onClick={() => setShowTechDetails((v) => !v)}
                  >
                    {showTechDetails ? t("hideTech") : t("showTech")}
                  </Button>
                )}
                {showTechDetails && statusQ.data?.wazuh_group && (
                  <code className="text-xs text-muted-foreground">
                    {statusQ.data.wazuh_group}
                  </code>
                )}
              </div>
              {canAdmin && enabled && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 text-xs"
                  onClick={() => syncMut.mutate()}
                  disabled={syncMut.isPending}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  {t("sync")}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {!enabled && !statusQ.isLoading && (
        <Card data-testid="guard-disabled">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("disabledHint")}
          </CardContent>
        </Card>
      )}

      {enabled && (
        <>
          {canAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="h-4 w-4" />
                  {t("enrollTitle")}
                </CardTitle>
                <CardDescription>{t("enrollDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex max-w-xl flex-col gap-2 sm:flex-row sm:items-start sm:gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor="enroll-label">{t("labelOptional")}</Label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Input
                        id="enroll-label"
                        value={tokenLabel}
                        onChange={(e) => setTokenLabel(e.target.value)}
                        placeholder="vps-colo-1"
                      />
                      <Button
                        className="shrink-0"
                        onClick={() => tokenMut.mutate()}
                        disabled={tokenMut.isPending}
                      >
                        {t("createToken")}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("labelHint")}
                    </p>
                  </div>
                </div>
                {rawToken && (
                  <div
                    className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs"
                    data-testid="guard-host-enroll-steps"
                  >
                    <div>
                      <p className="mb-1 font-medium text-foreground">
                        {t("saveNow")}
                      </p>
                      <code className="break-all">{rawToken}</code>
                    </div>
                    <div>
                      <p className="mb-1.5 font-medium text-foreground">
                        {t("hostStepsTitle")}
                      </p>
                      <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground">
                        {GUARD_HOST_SETUP_STEPS.map((step) => (
                          <li key={step.slice(0, 32)}>{step}</li>
                        ))}
                      </ol>
                    </div>
                    <div>
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-foreground">
                          {t("curlExample")}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            void navigator.clipboard
                              ?.writeText(enrollCurl)
                              .then(() => {
                                setCurlCopied(true);
                                window.setTimeout(
                                  () => setCurlCopied(false),
                                  2000,
                                );
                              })
                              .catch(() => undefined);
                          }}
                        >
                          {curlCopied ? t("copied") : t("copyCurl")}
                        </Button>
                      </div>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded border border-border/60 bg-background/80 p-2 font-mono text-[11px] leading-relaxed text-foreground">
                        {enrollCurl}
                      </pre>
                      <p className="mt-2 text-muted-foreground">
                        {t("curlHint")}
                      </p>
                    </div>
                    <div data-testid="guard-agent-install-steps">
                      <p className="mb-1.5 font-medium text-foreground">
                        {t("agentInstallTitle")}
                      </p>
                      <p className="mb-2 text-muted-foreground">
                        {GUARD_AGENT_INSTALL_INTRO}
                      </p>
                      <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground">
                        {GUARD_AGENT_INSTALL_STEPS.map((step) => (
                          <li key={step.slice(0, 36)}>{step}</li>
                        ))}
                      </ol>
                      <div
                        className="mt-3 space-y-2"
                        data-testid="guard-distro-install-commands"
                      >
                        <p className="font-medium text-foreground">
                          {t("distroCommands")}
                        </p>
                        <Accordion
                          type="single"
                          collapsible
                          className="w-full space-y-2"
                        >
                          {GUARD_DISTRO_INSTALL_GUIDES.map((guide) => (
                            <AccordionItem
                              key={guide.id}
                              value={guide.id}
                              className="rounded border border-border/60 bg-background/80 px-2 last:border-b"
                            >
                              <AccordionTrigger>
                                <span>
                                  <span className="block font-medium text-foreground">
                                    {guide.title}
                                  </span>
                                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                                    {guide.blurb}
                                  </span>
                                </span>
                              </AccordionTrigger>
                              <AccordionContent forceMount>
                                <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-foreground">
                                  {guide.commands.join("\n")}
                                </pre>
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                        <p className="text-muted-foreground">
                          {GUARD_DISTRO_INSTALL_FOOTER}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {tokensQ.isLoading ? (
                  <Skeleton className="h-12 w-full" />
                ) : (
                  <>
                    <Table className="min-w-[36rem]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[10rem]">
                            {t("colLabel")}
                          </TableHead>
                          <TableHead className="min-w-[9.5rem]">
                            {t("colExpires")}
                          </TableHead>
                          <TableHead className="min-w-[7rem]">
                            {t("colStatus")}
                          </TableHead>
                          <TableHead className="min-w-[4.5rem]">
                            {t("colAction")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleTokens.map((tok) => (
                          <TableRow
                            key={tok.id}
                            data-testid="guard-enroll-token-row"
                          >
                            <TableCell className="max-w-[14rem]">
                              <span
                                className="block truncate font-medium"
                                title={tok.label || tok.id}
                              >
                                {tok.label || t("tokenFallback")}
                              </span>
                              <span
                                className="block truncate font-mono text-[11px] text-muted-foreground"
                                title={tok.id}
                              >
                                {tok.id}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {formatWhen(tok.expires_at)}
                            </TableCell>
                            <TableCell>
                              {tok.revoked_at ? (
                                <Badge variant="info">
                                  {t("statusRevoked")}
                                </Badge>
                              ) : tok.used_at ? (
                                <Badge className="border border-border bg-muted text-foreground">
                                  {t("statusUsed")}
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-500/15 text-emerald-600">
                                  {t("statusReady")}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {!tok.revoked_at && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-8 text-xs text-destructive"
                                      aria-label={t("revokeTokenAria", {
                                        label: tok.label || tok.id,
                                      })}
                                      disabled={revokeMut.isPending}
                                    >
                                      {t("revoke")}
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>
                                        {t("revokeConfirmTitle")}
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        {t("revokeConfirmBody")}
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>
                                        {t("cancel")}
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        className={buttonVariants({
                                          variant: "destructive",
                                        })}
                                        onClick={() => revokeMut.mutate(tok.id)}
                                      >
                                        {t("revoke")}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {tokens.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                        <span>
                          {t("tokenSummary", {
                            total: tokens.length,
                            unused: unusedCount,
                          })}
                          {tokens.length > 5
                            ? t("tokenShowing", {
                                visible: visibleTokens.length,
                                total: tokens.length,
                              })
                            : ""}
                        </span>
                        {tokens.length > 5 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-primary"
                            onClick={() => setShowAllTokens((v) => !v)}
                          >
                            {showAllTokens
                              ? t("showFewer")
                              : t("showMore", { count: tokens.length - 5 })}
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card data-testid="guard-agents">
            <CardHeader>
              <CardTitle className="text-base">{t("agents")}</CardTitle>
            </CardHeader>
            <CardContent>
              {agentsQ.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (agentsQ.data?.length ?? 0) === 0 ? (
                <div
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-12 text-center"
                  data-testid="guard-agents-empty"
                >
                  <Shield className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t("noAgents")}</p>
                </div>
              ) : (
                <div>
                  <Table className="min-w-[36rem]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[10rem]">
                          {t("colName")}
                        </TableHead>
                        <TableHead className="min-w-[6.5rem]">
                          {t("colStatus")}
                        </TableHead>
                        <TableHead className="min-w-[9.5rem]">
                          {t("colLastSeen")}
                        </TableHead>
                        <TableHead className="min-w-[5rem]">
                          {t("colVersion")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agentsQ.data?.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell
                            className="max-w-[14rem] truncate font-mono text-xs font-medium"
                            title={a.name}
                          >
                            {a.name}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {statusBadge(a.status, t)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {formatWhen(a.last_keep_alive)}
                          </TableCell>
                          <TableCell
                            className="max-w-[8rem] truncate text-muted-foreground"
                            title={a.version ?? undefined}
                          >
                            {a.version ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="guard-alerts">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("alertsTitle")}</CardTitle>
              <CardDescription>{t("alertsDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              {alertsQ.isLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : (alertsQ.data?.length ?? 0) === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-10 text-center">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t("noAlerts")}</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {alertsQ.data?.map((al) => (
                    <li
                      key={al.id}
                      className="rounded-md border border-border/80 px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="critical">L{al.rule_level}</Badge>
                        <span className="font-medium">
                          {al.rule_description}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatWhen(al.occurred_at)}
                        {al.agent_name ? ` · ${al.agent_name}` : ""}
                        {al.rule_id ? ` · rule ${al.rule_id}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
