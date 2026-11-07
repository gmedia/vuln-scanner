import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpen,
  Shield,
  Mail,
  Calendar,
  Coins,
  Loader2,
  Copy,
  Check,
  Radar,
  Send,
  Layers,
  UserX,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import {
  AdminNotice,
  AdminShell,
  AdminShellBody,
  AdminShellHead,
} from "@/components/admin/AdminShell";
import { mutationTone } from "@/components/admin/adminChrome";
import PageHeader from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/patterns/EmptyState";
import PageHeaderBack from "@/components/layout/PageHeaderBack";
import { adminApi } from "@/api/admin";
import { apiErrorMessage } from "@/api/apiErrors";
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
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

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
      toast.success(t("creditsUpdatedToast"));
      queryClient.invalidateQueries({ queryKey: ["admin-user", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setAmount("");
      setDescription("");
      setConfirmAdjust(false);
      setCreditsError(null);
    },
    onError: (err) => {
      setCreditsError(apiErrorMessage(err, t("creditsUpdateFail")));
    },
  });

  const resendVerification = useMutation({
    mutationFn: () => adminApi.resendVerification(id!),
    onMutate: () => setResendError(null),
    onSuccess: () => {
      setResendError(null);
      toast.success(t("resendSentToast"));
    },
    onError: (err) => {
      setResendError(apiErrorMessage(err, t("resendFail")));
    },
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
      toast.error(t("copyEmailFail"));
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

      <AdminShell testid="credit-adjust-guide" tone="info">
        <AdminShellHead
          icon={BookOpen}
          title={t("creditGuideTitle")}
          hint={t("creditGuideHint")}
        />
        <AdminShellBody>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="steps">
              <AccordionTrigger>{t("creditGuideStepsTitle")}</AccordionTrigger>
              <AccordionContent>
                <ol className="ml-4 list-decimal space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <li>{t("creditGuideStep1")}</li>
                  <li>{t("creditGuideStep2")}</li>
                  <li>{t("creditGuideStep3")}</li>
                </ol>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="limits">
              <AccordionTrigger>{t("creditGuideLimitsTitle")}</AccordionTrigger>
              <AccordionContent>
                <ul className="ml-4 list-disc space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <li>{t("creditGuideLimit1")}</li>
                  <li>{t("creditGuideLimit2")}</li>
                  <li>{t("creditGuideLimit3")}</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </AdminShellBody>
      </AdminShell>

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
                    <Check className="h-3.5 w-3.5 text-primary-text" />
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
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <Badge
                    variant="default"
                    className="text-[10px]"
                    data-testid="admin-user-detail-tier"
                    title={user.sku ?? undefined}
                  >
                    {user.sku_label ?? t("tierNone")}
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
                      {resendError ?? t("resendFail")}
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
                <span className="font-mono text-sm tabular-nums text-primary-text">
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
                      setCreditsError(null);
                      updateCredits.reset?.();
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
                  {creditsError ?? t("creditsUpdateFail")}
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
        <EmptyState
          testId="admin-user-not-found"
          icon={UserX}
          title={t("userNotFound")}
        />
      )}
    </div>
  );
}

export default AdminUserDetail;
