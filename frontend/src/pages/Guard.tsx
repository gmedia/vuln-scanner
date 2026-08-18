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
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
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

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "active") return <Badge className="bg-emerald-500/15 text-emerald-600">aktif</Badge>;
  if (s === "disconnected")
    return <Badge className="bg-amber-500/15 text-amber-700">terputus</Badge>;
  if (s === "pending") return <Badge className="bg-sky-500/15 text-sky-700">menunggu</Badge>;
  return <Badge variant="info">{status}</Badge>;
}

export default function Guard() {
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
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, "Gagal mengaktifkan Guard")),
  });

  const syncMut = useMutation({
    mutationFn: syncGuard,
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, "Sinkronisasi gagal")),
  });

  const tokenMut = useMutation({
    mutationFn: () => createEnrollToken(tokenLabel.trim() || undefined),
    onSuccess: (data) => {
      setRawToken(data.token);
      setTokenLabel("");
      setActionError(null);
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, "Gagal membuat token enroll")),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeEnrollToken(id),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, "Gagal mencabut token enroll")),
  });

  const enabled = statusQ.data?.enabled ?? false;

  const tokens = tokensQ.data ?? [];
  const visibleTokens = showAllTokens ? tokens : tokens.slice(0, 5);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="sticky top-0 z-10 -mx-4 mb-2 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur-sm md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Shield className="h-6 w-6 text-primary" />
              Guard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Inventori agen host + alert kritis (lapisan ringkas). Bukan SIEM penuh.
            </p>
          </div>
          {canAdmin && !enabled && (
            <Button
              onClick={() => enableMut.mutate()}
              disabled={enableMut.isPending}
            >
              Aktifkan Guard
            </Button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {actionError}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status</CardTitle>
          <CardDescription>Organisasi aktif · sinkron proyeksi Wazuh</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {statusQ.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : statusQ.isError ? (
            <p className="text-destructive">Gagal memuat status Guard</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  data-testid="guard-state"
                  data-enabled={enabled ? "true" : "false"}
                >
                  Status:{" "}
                  <strong>{enabled ? "aktif" : "nonaktif"}</strong>
                </span>
                {statusQ.data?.degraded && (
                  <Badge className="bg-amber-500/15 text-amber-800">terdegradasi</Badge>
                )}
                {canAdmin && enabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => syncMut.mutate()}
                    disabled={syncMut.isPending}
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Sinkronkan
                  </Button>
                )}
              </div>
              <p className="text-muted-foreground">
                Sinkron inventori: {formatWhen(statusQ.data?.last_inventory_sync_at ?? null)}
              </p>
              <p className="text-muted-foreground">
                Sinkron alert: {formatWhen(statusQ.data?.last_alert_sync_at ?? null)}
              </p>
              {statusQ.data?.last_sync_error && (
                <p className="text-amber-700 dark:text-amber-400">
                  Kesalahan sinkron: {statusQ.data.last_sync_error}
                </p>
              )}
              {statusQ.data?.wazuh_group && (
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-0 text-xs text-muted-foreground"
                    onClick={() => setShowTechDetails((v) => !v)}
                  >
                    {showTechDetails ? "Sembunyikan detail teknis" : "Detail teknis"}
                  </Button>
                  {showTechDetails && (
                    <p className="text-muted-foreground">
                      Grup:{" "}
                      <code className="text-xs">{statusQ.data.wazuh_group}</code>
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {!enabled && !statusQ.isLoading && (
        <Card data-testid="guard-disabled">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Aktifkan Guard (admin/owner), lalu pasang agen di VPS/colo dengan token enroll.
          </CardContent>
        </Card>
      )}

      {enabled && (
        <>
          <Card data-testid="guard-agents">
            <CardHeader>
              <CardTitle className="text-base">Agen</CardTitle>
            </CardHeader>
            <CardContent>
              {agentsQ.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (agentsQ.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada agen. Enroll host dulu.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Nama</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 pr-3 font-medium">Terakhir terlihat</th>
                        <th className="py-2 font-medium">Versi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentsQ.data?.map((a) => (
                        <tr key={a.id} className="border-b border-border/60">
                          <td className="py-2 pr-3 font-medium">{a.name}</td>
                          <td className="py-2 pr-3">{statusBadge(a.status)}</td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {formatWhen(a.last_keep_alive)}
                          </td>
                          <td className="py-2 text-muted-foreground">{a.version ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="guard-alerts">
            <CardHeader>
              <CardTitle className="text-base">Alert kritis</CardTitle>
              <CardDescription>Rule level tinggi · tanpa raw log</CardDescription>
            </CardHeader>
            <CardContent>
              {alertsQ.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (alertsQ.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Tidak ada alert kritis tersimpan. Alert level tinggi akan muncul di sini.
                </p>
              ) : (
                <ul className="space-y-3">
                  {alertsQ.data?.map((al) => (
                    <li
                      key={al.id}
                      className="rounded-md border border-border/80 px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="critical">L{al.rule_level}</Badge>
                        <span className="font-medium">{al.rule_description}</span>
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

          {canAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="h-4 w-4" />
                  Enroll token
                </CardTitle>
                <CardDescription>
                  Token bisa dipakai ulang sampai kedaluwarsa atau dicabut. Nilai mentah hanya sekali.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="enroll-label">Label (opsional)</Label>
                    <Input
                      id="enroll-label"
                      value={tokenLabel}
                      onChange={(e) => setTokenLabel(e.target.value)}
                      placeholder="edge-colo"
                    />
                  </div>
                  <Button
                    onClick={() => tokenMut.mutate()}
                    disabled={tokenMut.isPending}
                  >
                    Buat token
                  </Button>
                </div>
                {rawToken && (
                  <div
                    className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs"
                    data-testid="guard-host-enroll-steps"
                  >
                    <div>
                      <p className="mb-1 font-medium text-foreground">
                        Simpan sekarang — tidak ditampilkan lagi:
                      </p>
                      <code className="break-all">{rawToken}</code>
                    </div>
                    <div>
                      <p className="mb-1.5 font-medium text-foreground">
                        Langkah host (setelah token)
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
                          Contoh curl enroll (tanpa JWT — token di body)
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
                          {curlCopied ? "Disalin" : "Salin curl"}
                        </Button>
                      </div>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded border border-border/60 bg-background/80 p-2 font-mono text-[11px] leading-relaxed text-foreground">
                        {enrollCurl}
                      </pre>
                      <p className="mt-2 text-muted-foreground">
                        Ganti <code className="text-foreground">&lt;AGENT_NAME&gt;</code>{" "}
                        (unik). Response:{" "}
                        <code className="text-foreground">agent_key</code>,{" "}
                        <code className="text-foreground">manager_host</code>,{" "}
                        <code className="text-foreground">install_hint</code> —
                        simpan di host saja. Bukan password Manager.
                      </p>
                    </div>
                    <div data-testid="guard-agent-install-steps">
                      <p className="mb-1.5 font-medium text-foreground">
                        Instalasi agen di host (per distro)
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
                          Perintah host target per distro
                        </p>
                        {GUARD_DISTRO_INSTALL_GUIDES.map((guide) => (
                          <div
                            key={guide.id}
                            className="rounded border border-border/60 bg-background/80 p-2"
                          >
                            <p className="font-medium text-foreground">
                              {guide.title}
                            </p>
                            <p className="mt-0.5 text-muted-foreground">
                              {guide.blurb}
                            </p>
                            <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-foreground">
                              {guide.commands.join("\n")}
                            </pre>
                          </div>
                        ))}
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
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b text-muted-foreground">
                        <tr>
                          <th className="py-2 pr-3 font-medium">Label</th>
                          <th className="py-2 pr-3 font-medium">Kedaluwarsa</th>
                          <th className="py-2 pr-3 font-medium">Status</th>
                          <th className="py-2 font-medium">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleTokens.map((t) => (
                            <tr
                              key={t.id}
                              data-testid="guard-enroll-token-row"
                              className="border-b border-border/60"
                            >
                              <td className="py-2 pr-3">{t.label || "token"}</td>
                              <td className="py-2 pr-3 text-muted-foreground">
                                {formatWhen(t.expires_at)}
                              </td>
                              <td className="py-2 pr-3">
                                {t.revoked_at ? (
                                  <Badge variant="info">dicabut</Badge>
                                ) : t.used_at ? (
                                  <Badge variant="info">terpakai</Badge>
                                ) : (
                                  <Badge className="bg-emerald-500/15 text-emerald-600">
                                    aktif
                                  </Badge>
                                )}
                              </td>
                              <td className="py-2">
                                {!t.revoked_at && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs text-destructive"
                                    disabled={revokeMut.isPending}
                                    onClick={() => {
                                      if (
                                        window.confirm(
                                          "Cabut token ini? Host tidak bisa enroll lagi dengan token tersebut.",
                                        )
                                      ) {
                                        revokeMut.mutate(t.id);
                                      }
                                    }}
                                  >
                                    Cabut
                                  </Button>
                                )}
                              </td>
                            </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {tokens.length > 5 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setShowAllTokens((v) => !v)}
                    >
                      {showAllTokens
                        ? "Tampilkan lebih sedikit"
                        : `Tampilkan ${tokens.length - 5} token lagi`}
                    </Button>
                  )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
