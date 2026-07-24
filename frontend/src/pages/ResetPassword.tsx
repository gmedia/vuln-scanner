import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Eye,
  EyeOff,
  Loader2,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Timer,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useRateLimitCooldown } from "@/hooks/useRateLimitCooldown";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import AuthLayout from "@/components/layout/AuthLayout";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { resetPassword, error, clearError } = useAuthStore();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const { cooldown, startCooldown } = useRateLimitCooldown();

  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  if (!token) {
    return (
      <AuthLayout title="Invalid Reset Link">
        <Card className="w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
            <p className="font-mono text-xs text-muted-foreground">
              This password reset link is invalid or missing a token.
            </p>
            <div className="space-y-2 pt-2">
              <Link to="/forgot-password" className="block">
                <Button className="w-full font-mono text-sm">
                  Request new link
                </Button>
              </Link>
              <Link to="/login" className="block">
                <Button
                  variant="outline"
                  className="w-full font-mono text-sm"
                >
                  Back to sign in
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (password.length < 8) {
      setValidationError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setValidationError("Passwords do not match");
      return;
    }

    setIsSubmitting(true);
    const ok = await resetPassword(token, password, confirmPassword);
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
      <AuthLayout title="Password Reset Successful!">
        <Card className="w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-primary mx-auto" />
            <p className="font-mono text-xs text-muted-foreground">
              Your password has been changed. You can now sign in with your new
              password.
            </p>
            <Link to="/login">
              <Button className="w-full font-mono text-sm mt-4">Sign In</Button>
            </Link>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set new password">
      <Card className="w-full">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="min-h-[1.25rem]">
              {cooldown > 0 && (
                <p className="font-mono text-xs text-amber-400 text-center flex items-center justify-center gap-1">
                  <Timer className="h-3 w-3" />
                  Too many attempts. Wait {cooldown}s
                </p>
              )}
              {(validationError || error) && cooldown === 0 && (
                <p className="font-mono text-xs text-red-400 text-center">
                  {validationError || error}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block font-mono text-xs text-muted-foreground"
              >
                New Password
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
            <div className="space-y-2">
              <label
                htmlFor="confirmPassword"
                className="block font-mono text-xs text-muted-foreground"
              >
                Confirm Password
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
                      ? "Hide confirm password"
                      : "Show confirm password"
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
              className="w-full font-mono text-sm"
              disabled={isSubmitting || cooldown > 0}
            >
              {cooldown > 0 ? (
                <>
                  <Timer className="mr-2 h-4 w-4" />
                  Wait {cooldown}s
                </>
              ) : isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting password...
                </>
              ) : (
                "Reset Password"
              )}
            </Button>
          </form>
          <p className="mt-6 text-center font-mono text-xs">
            <Link
              to="/login"
              className="inline-flex items-center gap-1 text-foreground/80 hover:text-primary hover:underline"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

export default ResetPassword;
