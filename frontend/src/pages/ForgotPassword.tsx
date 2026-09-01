import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Loader2, ArrowLeft, CheckCircle, Timer } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useRateLimitCooldown } from "@/hooks/useRateLimitCooldown";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import AuthLayout, {
  AUTH_SECONDARY_LINK,
} from "@/components/layout/AuthLayout";
import { useTranslation } from "react-i18next";

function ForgotPassword() {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  const { forgotPassword, error, clearError } = useAuthStore();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const { cooldown, startCooldown } = useRateLimitCooldown();

  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const ok = await forgotPassword(email);
    if (ok) {
      setSuccess(true);
    } else {
      setIsSubmitting(false);
      const errMsg = useAuthStore.getState().error;
      if (errMsg) {
        const match = errMsg.match(/wait (\d+) seconds/);
        if (match) {
          startCooldown(parseInt(match[1], 10));
        }
      }
    }
  };

  if (success) {
    return (
      <AuthLayout title={t("checkEmailTitle")}>
        <Card className="w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-primary mx-auto" />
            <p className="text-xs text-muted-foreground">{t("resetLinkSent")}</p>
            <p className="text-xs text-muted-foreground">{t("checkSpam")}</p>
            <Link to="/login">
              <Button className="mt-4 min-h-11 w-full text-sm">
                {t("backToSignIn")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("forgotTitle")} subtitle={t("forgotSubtitle")}>
      <Card className="w-full">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="min-h-[1.25rem]">
              {cooldown > 0 && (
                <p className="text-xs text-amber-400 text-center flex items-center justify-center gap-1">
                  <Timer className="h-3 w-3" />
                  {tc("waitSeconds", { seconds: cooldown })}
                </p>
              )}
              {error && cooldown === 0 && (
                <p className="text-xs text-red-400 text-center">{error}</p>
              )}
            </div>
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-xs text-muted-foreground"
              >
                {tc("email")}
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("signupEmailPlaceholder")}
                className="placeholder:text-muted-foreground/55"
                required
                disabled={isSubmitting}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("checkSpam")}</p>
            <Button
              type="submit"
              className="min-h-11 w-full text-sm"
              disabled={isSubmitting || cooldown > 0}
            >
              {cooldown > 0 ? (
                <>
                  <Timer className="mr-2 h-4 w-4" />
                  {tc("waitButton", { seconds: cooldown })}
                </>
              ) : isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("sendingReset")}
                </>
              ) : (
                t("sendResetLink")
              )}
            </Button>
          </form>
          <p className="mt-4 text-center">
            <Link to="/login" className={`${AUTH_SECONDARY_LINK} gap-1`}>
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("backToSignInLower")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

export default ForgotPassword;
