import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  Mail,
  Calendar,
  Coins,
  Loader2,
  Copy,
  Check,
  Radar,
  Send,
  UserX,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import {
  AdminNotice,
  AdminShell,
  AdminShellBody,
  AdminShellHead,
} from "@/components/admin/AdminShell";
import { mutationTone } from "@/components/admin/adminChrome";
import PageHeader from "@/components/layout/PageHeader";
import PageHeaderBack from "@/components/layout/PageHeaderBack";
import { adminApi } from "@/api/admin";
import { formatCredits } from "@/lib/utils";
import { Trans, useTranslation } from "react-i18next";
import { htmlLang, isAppLocale } from "@/i18n/locales";
import i18n from "@/i18n";

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

function AdminUserDetail() {
  const { t } = useTranslation("admin");
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmAdjust, setConfirmAdjust] = useState(false);

  const { data: user, isLoading } = useQuery({
    queryKey: ["admin-user", id],
    queryFn: () => adminApi.getUserDetail(id!),
    enabled: !!id,
  });

  const updateCredits = useMutation({
    mutationFn: () =>
      adminApi.updateUserCredits(id!, {
        amount: parseInt(amount, 10),
        description: description.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setAmount("");
      setDescription("");
      setConfirmAdjust(false);
    },
  });

  const resendVerification = useMutation({
    mutationFn: () => adminApi.resendVerification(id!),
  });

  const handleSubmit = () => {
    const numAmount = parseInt(amount, 10);
    if (!numAmount || numAmount === 0) return;
    if (!confirmAdjust) {
      setConfirmAdjust(true);
      return;
    }
    updateCredits.mutate();
  };

  const handleCopyEmail = async () => {
    if (!user?.email) return;
    try {
      await navigator.clipboard.writeText(user.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      void 0;
    }
  };

  const creditsTone = mutationTone({
    error: updateCredits.isError,
    success: updateCredits.isSuccess,
    pending: updateCredits.isPending,
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        leading={<PageHeaderBack to="/admin/users" label={t("detailBack")} />}
        title={t("detailTitle")}
        description={t("detailSubtitle")}
      />

      {isLoading ? (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <AdminShell tone="primary">
            <AdminShellHead title={t("profile")} />
            <AdminShellBody>
              <TableRowSkeleton rows={4} columns={4} />
            </AdminShellBody>
          </AdminShell>
          <AdminShell tone="primary">
            <AdminShellHead title={t("creditAdjust")} />
            <AdminShellBody>
              <TableRowSkeleton rows={3} columns={3} />
            </AdminShellBody>
          </AdminShell>
        </div>
      ) : user ? (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <AdminShell tone={user.is_verified ? "primary" : "warn"}>
            <AdminShellHead icon={Shield} title={t("profile")} />
            <AdminShellBody className="space-y-4">
              <div className="flex w-full min-w-0 items-start gap-2">
                <Mail className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span
                  className="min-w-0 flex-1 break-all font-mono text-sm text-foreground"
                  title={user.email}
                >
                  {user.email}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyEmail}
                  className="h-11 w-11 shrink-0 p-0 text-xs"
                  title={copied ? t("copied") : t("copyEmail")}
                  aria-label={copied ? t("copied") : t("copyEmail")}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <Badge
                    variant={user.is_admin ? "completed" : "default"}
                    className="text-[10px]"
                  >
                    {user.is_admin ? t("roleAdmin") : t("roleUser")}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <Badge
                    variant={user.is_verified ? "completed" : "pending"}
                    className="text-[10px]"
                  >
                    {user.is_verified ? t("verified") : t("unverified")}
                  </Badge>
                </div>
              </div>
              {!user.is_verified && (
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => resendVerification.mutate()}
                    disabled={resendVerification.isPending}
                    className="min-h-11 text-xs sm:min-h-9"
                  >
                    {resendVerification.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        {t("sending")}
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-3 w-3" />
                        {t("resendVerification")}
                      </>
                    )}
                  </Button>
                  {resendVerification.isError && (
                    <AdminNotice tone="danger" role="alert">
                      {t("resendFail")}
                    </AdminNotice>
                  )}
                  {resendVerification.isSuccess &&
                    resendVerification.data?.email_sent === false && (
                      <AdminNotice tone="danger" role="alert">
                        {t("resendFailRetry")}
                      </AdminNotice>
                    )}
                  {resendVerification.isSuccess &&
                    resendVerification.data?.email_sent !== false && (
                      <AdminNotice tone="success" role="status">
                        {t("resendOk")}
                      </AdminNotice>
                    )}
                </div>
              )}
              <div className="flex items-center gap-3">
                <Coins className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="font-mono text-sm tabular-nums text-primary">
                  {formatCredits(user.credits)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Radar className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  <Trans
                    ns="admin"
                    i18nKey="scansPerformed"
                    values={{ count: user.scan_count }}
                    components={{
                      n: <span className="font-mono tabular-nums" />,
                    }}
                  />
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {t("joined", { date: formatDate(user.created_at) })}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {user.last_login_at
                    ? t("lastLoginAt", { date: formatDateTime(user.last_login_at) })
                    : t("lastLoginNever")}
                </span>
              </div>
            </AdminShellBody>
          </AdminShell>

          <AdminShell tone={creditsTone}>
            <AdminShellHead icon={KeyRound} title={t("creditAdjust")} />
            <AdminShellBody className="space-y-4">
              <div className="grid max-w-xl gap-4">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="admin-credit-amount">{t("amount")}</Label>
                  <Input
                    id="admin-credit-amount"
                    type="number"
                    placeholder={t("amountPlaceholder")}
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setConfirmAdjust(false);
                    }}
                    className="max-w-[12rem] font-mono"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="admin-credit-description">
                    {t("description")}
                  </Label>
                  <Input
                    id="admin-credit-description"
                    type="text"
                    placeholder={t("descriptionPlaceholder")}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="max-w-xl"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={handleSubmit}
                  size="lg"
                  disabled={
                    !amount || parseInt(amount, 10) === 0 || updateCredits.isPending
                  }
                >
                  {updateCredits.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      {t("processing")}
                    </>
                  ) : confirmAdjust ? (
                    t("confirmAdjust")
                  ) : (
                    t("adjustCredits")
                  )}
                </Button>
                {confirmAdjust && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setConfirmAdjust(false)}
                  >
                    {t("cancel")}
                  </Button>
                )}
              </div>
              {updateCredits.isError && (
                <AdminNotice tone="danger" role="alert">
                  {t("creditsUpdateFail")}
                </AdminNotice>
              )}
              {updateCredits.isSuccess && (
                <AdminNotice tone="success" role="status">
                  {t("creditsUpdateOk")}
                </AdminNotice>
              )}
            </AdminShellBody>
          </AdminShell>
        </div>
      ) : (
        <div
          className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-8 text-center"
          data-testid="admin-user-not-found"
        >
          <UserX className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">
            {t("userNotFound")}
          </p>
        </div>
      )}
    </div>
  );
}

export default AdminUserDetail;
