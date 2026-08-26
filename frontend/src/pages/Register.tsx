import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import AuthLayout, {
  AUTH_SECONDARY_LINK,
} from "@/components/layout/AuthLayout";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import { useTranslation } from "react-i18next";

function Register() {
  const navigate = useNavigate();
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  const { register, resendVerification, error, isAuthenticated, clearError } =
    useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendFeedback, setResendFeedback] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (password.length < 8) {
      setValidationError(t("passwordMin"));
      return;
    }
    if (password !== confirmPassword) {
      setValidationError(t("passwordMismatch"));
      return;
    }

    setIsSubmitting(true);
    const result = await register(email, password, confirmPassword);
    if (!mountedRef.current) return;
    if (result.ok) {
      setEmailSent(result.emailSent);
      setStatusMessage(result.message);
      setSuccess(true);
    } else {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    setResendFeedback(null);
    setIsResending(true);
    const result = await resendVerification(email);
    if (!mountedRef.current) return;
    setIsResending(false);
    if (result.ok) {
      setEmailSent(result.emailSent);
      setStatusMessage(result.message);
      if (result.emailSent === false) {
        setResendFeedback(result.message || t("verifySendFailed"));
      } else {
        setResendFeedback(result.message || t("verifySent"));
      }
    } else {
      setResendFeedback(t("resendFailed"));
    }
  };

  if (success) {
    const sendFailed = emailSent === false;
    return (
      <AuthLayout title={t("registerSuccess")}>
        <Card className="w-full">
          <CardContent className="pt-6 text-center space-y-4">
            {sendFailed ? (
              <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto" />
            ) : (
              <CheckCircle className="h-12 w-12 text-primary mx-auto" />
            )}
            <p className="text-xs text-muted-foreground">
              {statusMessage ||
                (sendFailed
                  ? t("registerEmailFailed")
                  : t("registerCheckEmail"))}
            </p>
            {resendFeedback && (
              <p
                className={`text-xs ${
                  emailSent === false ? "text-amber-400" : "text-primary"
                }`}
              >
                {resendFeedback}
              </p>
            )}
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
            <Link to="/login">
              <Button className="w-full text-sm mt-2">{t("goToSignIn")}</Button>
            </Link>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("createAccount")}>
      <Card className="w-full">
        <CardContent className="pt-6">
          <GoogleSignInButton />
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="min-h-[1.25rem]">
              {(error || validationError) && (
                <p className="text-xs text-red-400 text-center">
                  {validationError || error}
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                  aria-label={
                    showPassword ? tc("hidePassword") : tc("showPassword")
                  }
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="confirmPassword"
                className="block text-xs text-muted-foreground"
              >
                {tc("confirmPassword")}
              </label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={isSubmitting}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                  aria-label={
                    showConfirmPassword
                      ? tc("hideConfirmPassword")
                      : tc("showConfirmPassword")
                  }
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
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
                  {t("creatingAccount")}
                </>
              ) : (
                t("createAccountSubmit")
              )}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-foreground/80">
            {t("alreadyHaveAccount")}{" "}
            <Link to="/login" className={AUTH_SECONDARY_LINK}>
              {t("signInCta")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

export default Register;
