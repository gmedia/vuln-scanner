import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import AuthLayout from "@/components/layout/AuthLayout";

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
  const { login, resendVerification, error, isAuthenticated, clearError } =
    useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendFeedback, setResendFeedback] = useState<string | null>(null);

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
    setResendFeedback(null);
    setIsSubmitting(true);
    const success = await login(email, password);
    if (success) {
      navigate("/dashboard");
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
        setResendFeedback(
          result.message ||
            "Failed to send verification email. Please try again shortly.",
        );
      } else {
        setResendFeedback(
          result.message || "Verification email sent. Please check your inbox.",
        );
      }
    } else {
      setResendFeedback(
        "Failed to resend verification email. Please try again.",
      );
    }
  };

  const showResend = isUnverifiedError(error);

  return (
    <AuthLayout title="Sign in">
      <Card className="w-full">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="min-h-[1.25rem]">
              {error && (
                <p className="font-mono text-xs text-red-400 text-center">
                  {error}
                </p>
              )}
              {resendFeedback && (
                <p className="font-mono text-xs text-primary text-center mt-1">
                  {resendFeedback}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block font-mono text-xs text-muted-foreground"
              >
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block font-mono text-xs text-muted-foreground"
              >
                Password
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
                  aria-label={showPassword ? "Hide password" : "Show password"}
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
            <Button
              type="submit"
              className="w-full font-mono text-sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
          {showResend && (
            <div className="mt-4 space-y-2">
              <p className="font-mono text-xs text-muted-foreground text-center">
                Need a new verification link?
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full font-mono text-sm"
                onClick={handleResend}
                disabled={isResending || !email}
              >
                {isResending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resending...
                  </>
                ) : (
                  "Resend verification email"
                )}
              </Button>
            </div>
          )}
          <p className="mt-4 text-center font-mono text-xs">
            <Link
              to="/forgot-password"
              className="text-foreground/80 hover:text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </p>
          <p className="mt-4 text-center font-mono text-xs text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/register" className="text-primary hover:underline">
              Register
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

export default Login;
