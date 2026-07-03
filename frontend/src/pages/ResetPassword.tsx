import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Crosshair, Loader2, ArrowLeft, CheckCircle, AlertCircle, Timer } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useRateLimitCooldown } from "@/hooks/useRateLimitCooldown";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { resetPassword, error, clearError } = useAuthStore();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
            <h2 className="font-mono text-lg font-bold tracking-wide text-foreground">
              Invalid Reset Link
            </h2>
            <p className="font-mono text-xs text-muted-foreground">
              This password reset link is invalid or missing a token.
            </p>
            <Link to="/login">
              <Button className="w-full font-mono text-sm mt-4">
                Back to Sign In
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
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
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-primary mx-auto" />
            <h2 className="font-mono text-lg font-bold tracking-wide text-foreground">
              Password Reset Successful!
            </h2>
            <p className="font-mono text-xs text-muted-foreground">
              Your password has been changed. You can now sign in with your new password.
            </p>
            <Link to="/login">
              <Button className="w-full font-mono text-sm mt-4">
                Sign In
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Crosshair className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="font-mono text-lg tracking-wide">
            Set New Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
            <div className="space-y-2">
              <label htmlFor="password" className="block font-mono text-xs text-muted-foreground">
                New Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="block font-mono text-xs text-muted-foreground">
                Confirm Password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={isSubmitting}
              />
            </div>
            <Button type="submit" className="w-full font-mono text-sm" disabled={isSubmitting || cooldown > 0}>
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
          <p className="mt-6 text-center font-mono text-xs text-muted-foreground">
            <Link to="/login" className="inline-flex items-center gap-1 hover:text-primary hover:underline">
              <ArrowLeft className="h-3 w-3" />
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default ResetPassword;
