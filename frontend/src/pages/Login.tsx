import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import AuthLayout, {
  AUTH_SECONDARY_LINK,
} from "@/components/layout/AuthLayout";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import { useTranslation } from "react-i18next";
import { captureInviteFromSearch, postAuthPath } from "@/lib/inviteToken";

function isUnverifiedError(message: string | null): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("belum diverifikasi") ||
    lower.includes("not verified") ||
    lower.includes("unverified")
  );
}

function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  const { login, resendVerification, error, isAuthenticated, clearError } =
    useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendFeedback, setResendFeedback] = useState<string | null>(null);

  useEffect(() => {
    captureInviteFromSearch(searchParams.toString());
  }, [searchParams]);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(postAuthPath());
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendFeedback(null);
    setIsSubmitting(true);
    const success = await login(email, password);
    if (success) {
      navigate(postAuthPath());
    } else {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setResendFeedback(null);
    setIsResending(true);
    const result = await resendVerification(email);
    setIsResending(false);
    if (result.ok) {
      if (result.emailSent === false) {
        setResendFeedback(result.message || t("verifySendFailed"));
      } else {
        setResendFeedback(result.message || t("verifySent"));
      }
    } else {
      setResendFeedback(t("resendFailed"));
    }
  };

  const showResend = isUnverifiedError(error);

  return (
    <AuthLayout title={t("signInTitle")} maxWidth="lg">
      <Card className="w-full">
        <CardContent className="pt-6">
          <GoogleSignInButton />
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="min-h-[1.25rem]">
              {error && (
                <p className="text-xs text-red-400 text-center">{error}</p>
              )}
              {resendFeedback && (
                <p className="text-xs text-primary text-center mt-1">
                  {resendFeedback}
                </p>
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
                placeholder={t("emailPlaceholder")}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-xs text-muted-foreground"
              >
                {tc("password")}
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={isSubmitting}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                  aria-label={
                    showPassword ? tc("hidePassword") : tc("showPassword")
                  }
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full text-sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("signingIn")}
                </>
              ) : (
                tc("signIn")
              )}
            </Button>
          </form>
          {showResend && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-muted-foreground text-center">
                {t("needVerification")}
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full text-sm"
                onClick={handleResend}
                disabled={isResending || !email}
              >
                {isResending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("resending")}
                  </>
                ) : (
                  t("resendVerification")
                )}
              </Button>
            </div>
          )}
          <p className="mt-3 text-center">
            <Link to="/forgot-password" className={AUTH_SECONDARY_LINK}>
              {t("forgotPassword")}
            </Link>
          </p>
          <p className="mt-1 text-center text-sm text-foreground/80">
            {t("noAccount")}{" "}
            <Link
              to={
                searchParams.get("invite")
                  ? `/register?invite=${encodeURIComponent(searchParams.get("invite")!)}`
                  : "/register"
              }
              className={AUTH_SECONDARY_LINK}
            >
              {t("register")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

export default Login;
