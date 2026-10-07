import { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { Loader2, CheckCircle, XCircle, Timer, Mail } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useRateLimitCooldown } from "@/hooks/useRateLimitCooldown";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import AuthLayout from "@/components/layout/AuthLayout";
import {
  AuthCard,
  AuthCardBody,
  AuthNotice,
  AuthStatusIcon,
} from "@/components/auth/AuthCard";
import { useTranslation } from "react-i18next";

function maskSignupEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const keep = local.slice(0, 1);
  return `${keep}***@${domain}`;
}

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  const { verifyEmail, resendVerification, isLoading, error } = useAuthStore();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [resendEmail, setResendEmail] = useState(
    () => searchParams.get("email") ?? "",
  );
  const [showResend, setShowResend] = useState(true);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const { cooldown, startCooldown } = useRateLimitCooldown();

  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) return;

    const verify = async () => {
      const success = await verifyEmail(token);
      setStatus(success ? "success" : "error");
    };

    verify();
  }, [token, verifyEmail]);

  if (!token) {
    const handleResend = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!resendEmail) return;
      setIsResending(true);
      setResendSuccess(false);
      const result = await resendVerification(resendEmail);
      if (result.ok) {
        setResendSuccess(result.emailSent !== false);
        setIsResending(false);
      } else {
        setIsResending(false);
        const errMsg = useAuthStore.getState().error;
        if (errMsg) {
          const match = errMsg.match(/wait (\d+) seconds/);
          if (match) {
            startCooldown(parseInt(match[1], 10));
          }
        }
      }
    };

    const signupHint = resendEmail.trim()
      ? maskSignupEmail(resendEmail.trim())
      : null;

    return (
      <AuthLayout
        title={t("verifyTitle")}
        subtitle={t("verifySubtitle")}
        maxWidth="lg"
      >
        <AuthCard tone="info">
          <AuthCardBody center>
            <AuthStatusIcon icon={Mail} tone="info" />
            {signupHint && (
              <p className="text-sm text-foreground/90">
                {t("sentTo")} <span className="font-medium">{signupHint}</span>
              </p>
            )}
            <p className="text-xs text-foreground/70">{t("checkSpamPromo")}</p>

            {!showResend ? (
              <button
                type="button"
                className="py-2 text-sm text-foreground/90 underline-offset-4 hover:text-primary hover:underline"
                onClick={() => setShowResend(true)}
              >
                {t("didntGetIt")}
              </button>
            ) : (
              <form onSubmit={handleResend} className="space-y-3 text-left">
                <p className="text-center text-xs text-foreground/70">
                  {t("enterSignupEmail")}
                </p>

                <div className="min-h-[1.25rem]">
                  {cooldown > 0 && (
                    <AuthNotice tone="warn">
                      <span className="flex items-center justify-center gap-1">
                        <Timer className="h-3 w-3" />
                        {tc("waitSeconds", { seconds: cooldown })}
                      </span>
                    </AuthNotice>
                  )}
                  {resendSuccess && cooldown === 0 && (
                    <AuthNotice tone="success">{t("verifyResent")}</AuthNotice>
                  )}
                  {error && !resendSuccess && cooldown === 0 && (
                    <AuthNotice tone="danger">{error}</AuthNotice>
                  )}
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="email">{tc("email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder={t("signupEmailPlaceholder")}
                    required
                    disabled={isResending}
                  />
                </div>
                <Button
                  type="submit"
                  className="min-h-11 w-full text-sm"
                  disabled={isResending || cooldown > 0}
                >
                  {cooldown > 0 ? (
                    <>
                      <Timer className="mr-2 h-4 w-4" />
                      {tc("waitButton", { seconds: cooldown })}
                    </>
                  ) : isResending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("sending")}
                    </>
                  ) : (
                    t("resendVerificationTitle")
                  )}
                </Button>
              </form>
            )}

            <Link to="/login" className="block">
              <Button variant="outline" className="min-h-11 w-full text-sm">
                {t("backToSignInLower")}
              </Button>
            </Link>
          </AuthCardBody>
        </AuthCard>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={
        status === "success"
          ? t("emailVerified")
          : status === "error"
            ? t("verifyFailed")
            : t("verifyingEmail")
      }
      maxWidth="lg"
    >
      <AuthCard
        tone={
          status === "success"
            ? "success"
            : status === "error"
              ? "danger"
              : "info"
        }
      >
        <AuthCardBody center>
          {status === "idle" && (
            <div className="flex flex-col items-center gap-3">
              <AuthStatusIcon icon={Loader2} tone="info" spin />
              <p className="text-sm text-muted-foreground">{t("verifying")}</p>
            </div>
          )}
          {status === "success" && (
            <div className="flex flex-col items-center gap-3">
              <AuthStatusIcon icon={CheckCircle} tone="success" />
              <p className="text-sm text-muted-foreground">
                {t("emailVerifiedOk")}
              </p>
              <Button
                onClick={() => navigate("/dashboard")}
                className="min-h-11 w-full text-sm"
              >
                {t("goToDashboard")}
              </Button>
            </div>
          )}
          {status === "error" && (
            <div className="flex flex-col items-center gap-3">
              <AuthStatusIcon icon={XCircle} tone="danger" />
              <p className="text-sm text-muted-foreground">
                {error || t("verifyFailedRetry")}
              </p>
              <Link to="/login" className="w-full">
                <Button variant="outline" className="min-h-11 w-full text-sm">
                  {t("backToSignInLower")}
                </Button>
              </Link>
            </div>
          )}
        </AuthCardBody>
      </AuthCard>
    </AuthLayout>
  );
}

export default VerifyEmail;
