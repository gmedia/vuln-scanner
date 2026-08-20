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

function ForgotPassword() {
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
      <AuthLayout title="Check Your Email">
        <Card className="w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-primary mx-auto" />
            <p className="text-xs text-muted-foreground">
              We've sent a password reset link to your email address.
            </p>
            <Link to="/login">
              <Button className="w-full text-sm mt-4">
                Back to Sign In
              </Button>
            </Link>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot password"
      subtitle="Enter your email and we'll send a reset link."
    >
      <Card className="w-full">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="min-h-[1.25rem]">
              {cooldown > 0 && (
                <p className="text-xs text-amber-400 text-center flex items-center justify-center gap-1">
                  <Timer className="h-3 w-3" />
                  Too many attempts. Wait {cooldown}s
                </p>
              )}
              {error && cooldown === 0 && (
                <p className="text-xs text-red-400 text-center">
                  {error}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-xs text-muted-foreground"
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
            <Button
              type="submit"
              className="w-full text-sm"
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
                  Sending reset link...
                </>
              ) : (
                "Send Reset Link"
              )}
            </Button>
          </form>
          <p className="mt-4 text-center">
            <Link
              to="/login"
              className={`${AUTH_SECONDARY_LINK} gap-1`}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

export default ForgotPassword;
