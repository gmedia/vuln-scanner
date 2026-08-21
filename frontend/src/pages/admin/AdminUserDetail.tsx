import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  User,
  Shield,
  Mail,
  Calendar,
  Coins,
  Loader2,
  Copy,
  Check,
  Radar,
  Send,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
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

function AdminUserDetail() {
  const { t } = useTranslation("admin");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [copied, setCopied] = useState(false);

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
    },
  });

  const resendVerification = useMutation({
    mutationFn: () => adminApi.resendVerification(id!),
  });

  const handleSubmit = () => {
    const numAmount = parseInt(amount, 10);
    if (!numAmount || numAmount === 0) return;
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/admin/users")}
          className="text-xs"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t("detailBack")}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <User className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-lg font-bold tracking-wide text-foreground">
            {t("detailTitle")}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {t("detailSubtitle")}
          </p>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </CardContent>
        </Card>
      ) : user ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm tracking-wide">
                {t("profile")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span
                  className="min-w-0 flex-1 truncate font-mono text-sm text-foreground"
                  title={user.email}
                >
                  {user.email}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyEmail}
                  className="shrink-0 text-xs"
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
                    className="text-xs"
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
                    <div className="rounded-md border border-red-600/30 bg-red-600/10 px-3 py-2">
                      <p className="text-xs text-red-400">
                        {t("resendFail")}
                      </p>
                    </div>
                  )}
                  {resendVerification.isSuccess &&
                    resendVerification.data?.email_sent === false && (
                      <div className="rounded-md border border-red-600/30 bg-red-600/10 px-3 py-2">
                        <p className="text-xs text-red-400">
                          {t("resendFailRetry")}
                        </p>
                      </div>
                    )}
                  {resendVerification.isSuccess &&
                    resendVerification.data?.email_sent !== false && (
                      <div className="rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2">
                        <p className="text-xs text-green-400">
                          {t("resendOk")}
                        </p>
                      </div>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm tracking-wide">
                {t("creditAdjust")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="admin-credit-amount" className="mb-1.5 block">
                    {t("amount")}
                  </Label>
                  <Input
                    id="admin-credit-amount"
                    type="number"
                    placeholder={t("amountPlaceholder")}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label htmlFor="admin-credit-description" className="mb-1.5 block">
                    {t("description")}
                  </Label>
                  <Input
                    id="admin-credit-description"
                    type="text"
                    placeholder={t("descriptionPlaceholder")}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>
              <Button
                onClick={handleSubmit}
                disabled={
                  !amount || parseInt(amount, 10) === 0 || updateCredits.isPending
                }
                className="text-xs"
              >
                {updateCredits.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    {t("processing")}
                  </>
                ) : (
                  t("adjustCredits")
                )}
              </Button>
              {updateCredits.isError && (
                <div className="rounded-md border border-red-600/30 bg-red-600/10 px-3 py-2">
                  <p className="text-xs text-red-400">
                    {t("creditsUpdateFail")}
                  </p>
                </div>
              )}
              {updateCredits.isSuccess && (
                <div className="rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2">
                  <p className="text-xs text-green-400">
                    {t("creditsUpdateOk")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {t("userNotFound")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AdminUserDetail;
