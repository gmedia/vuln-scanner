import { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { Shield, Loader2, CheckCircle, XCircle, Timer } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useRateLimitCooldown } from "@/hooks/useRateLimitCooldown";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { verifyEmail, resendVerification, isLoading, error } = useAuthStore();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [resendEmail, setResendEmail] = useState("");
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
      const ok = await resendVerification(resendEmail);
      if (ok) {
        setResendSuccess(true);
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

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
        <div className="mb-6 flex items-center gap-2">
          <Shield className="h-8 w-8 text-primary" />
          <span className="font-mono text-xl font-bold tracking-wide">VULNSCANNER</span>
        </div>

        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="font-mono text-center text-lg">Check Your Email</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="mb-4 font-mono text-sm text-muted-foreground">
              We've sent a verification link to your email address.
              Click the link in the email to verify your account.
            </p>
            <Link to="/login">
              <Button className="w-full font-mono text-sm">
                Back to Login
              </Button>
            </Link>

            <hr className="my-6 border-border" />

            <p className="mb-3 font-mono text-xs text-muted-foreground">
              Didn't receive the email? Enter your email to resend.
            </p>

            <form onSubmit={handleResend} className="space-y-3">
              {cooldown > 0 && (
                <p className="font-mono text-xs text-amber-400 text-center flex items-center justify-center gap-1">
                  <Timer className="h-3 w-3" />
                  Too many attempts. Wait {cooldown}s
                </p>
              )}
              {resendSuccess && cooldown === 0 && (
                <p className="font-mono text-xs text-green-400 text-center">
                  Verification email resent! Please check your inbox.
                </p>
              )}
              {error && !resendSuccess && cooldown === 0 && (
                <p className="font-mono text-xs text-red-400 text-center">
                  {error}
                </p>
              )}
              <Input
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={isResending}
              />
              <Button
                type="submit"
                className="w-full font-mono text-sm"
                disabled={isResending || cooldown > 0}
              >
                {cooldown > 0 ? (
                  <>
                    <Timer className="mr-2 h-4 w-4" />
                    Wait {cooldown}s
                  </>
                ) : isResending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Resend Verification Email"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="mb-6 flex items-center gap-2">
        <Shield className="h-8 w-8 text-primary" />
        <span className="font-mono text-xl font-bold tracking-wide">VULNSCANNER</span>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-mono text-center text-lg">Verifying Email</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          {isLoading && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="font-mono text-sm text-muted-foreground">Verifying...</p>
            </div>
          )}
          {status === "success" && (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <p className="font-mono text-sm text-muted-foreground">Email verified successfully!</p>
              <Button
                onClick={() => navigate("/dashboard")}
                className="w-full font-mono text-sm"
              >
                Go to Dashboard
              </Button>
            </div>
          )}
          {status === "error" && (
            <div className="flex flex-col items-center gap-3">
              <XCircle className="h-8 w-8 text-destructive" />
              <p className="font-mono text-sm text-muted-foreground">
                {error || "Verification failed. Please try again."}
              </p>
              <Link to="/login">
                <Button variant="outline" className="w-full font-mono text-sm">
                  Back to Login
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default VerifyEmail;
