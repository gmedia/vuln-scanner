import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Crosshair, Loader2, ArrowLeft, CheckCircle, Timer } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useRateLimitCooldown } from "@/hooks/useRateLimitCooldown";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";

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
      // Start cooldown on rate limit
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
              Check Your Email
            </h2>
            <p className="font-mono text-xs text-muted-foreground">
              We've sent a password reset link to your email address.
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Crosshair className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="font-mono text-lg tracking-wide">
            Reset Password
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
            {error && cooldown === 0 && (
              <p className="font-mono text-xs text-red-400 text-center">
                {error}
              </p>
            )}
            <div className="space-y-2">
              <label htmlFor="email" className="block font-mono text-xs text-muted-foreground">
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
            <Button type="submit" className="w-full font-mono text-sm" disabled={isSubmitting || cooldown > 0}>
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

export default ForgotPassword;
