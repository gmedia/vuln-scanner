import { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { Loader2, CheckCircle, XCircle, Timer, Mail } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useRateLimitCooldown } from "@/hooks/useRateLimitCooldown";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import AuthLayout from "@/components/layout/AuthLayout";

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
  const { verifyEmail, resendVerification, isLoading, error } = useAuthStore();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [resendEmail, setResendEmail] = useState(
    () => searchParams.get("email") ?? "",
  );
  const [showResend, setShowResend] = useState(false);
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
        title="Check your email"
        subtitle="Open the link we sent to verify your account."
        maxWidth="sm"
      >
        <Card className="w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <Mail className="h-10 w-10 text-primary mx-auto" />
            {signupHint && (
              <p className="text-sm text-foreground/90">
                Sent to <span className="font-medium">{signupHint}</span>
              </p>
            )}
            <p className="text-xs text-foreground/70">
              Check spam or promotions if it is not in your inbox.
            </p>

            {!showResend ? (
              <button
                type="button"
                className="text-sm text-foreground/90 underline-offset-4 hover:text-primary hover:underline py-2"
                onClick={() => setShowResend(true)}
              >
                Didn&apos;t get it?
              </button>
            ) : (
              <form onSubmit={handleResend} className="space-y-3 text-left">
                <p className="text-xs text-foreground/70 text-center">
                  Enter your signup email to resend the link.
                </p>

                <div className="min-h-[1.25rem]">
                  {cooldown > 0 && (
                    <p className="text-xs text-amber-400 text-center flex items-center justify-center gap-1">
                      <Timer className="h-3 w-3" />
                      Too many attempts. Wait {cooldown}s
                    </p>
                  )}
                  {resendSuccess && cooldown === 0 && (
                    <p className="text-xs text-green-400 text-center">
                      Verification email resent! Please check your inbox.
                    </p>
                  )}
                  {error && !resendSuccess && cooldown === 0 && (
                    <p className="text-xs text-red-400 text-center">
                      {error}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="block text-xs text-foreground/80"
                  >
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="your signup email"
                    required
                    disabled={isResending}
                  />
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full text-sm"
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
            )}

            <Link to="/login" className="block">
              <Button variant="outline" className="w-full text-sm">
                Back to sign in
              </Button>
            </Link>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={
        status === "success"
          ? "Email verified"
          : status === "error"
            ? "Verification failed"
            : "Verifying email"
      }
      maxWidth="sm"
    >
      <Card className="w-full">
        <CardContent className="pt-6 text-center">
          {status === "idle" && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Verifying...
              </p>
            </div>
          )}
          {status === "success" && (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <p className="text-sm text-muted-foreground">
                Email verified successfully!
              </p>
              <Button
                onClick={() => navigate("/dashboard")}
                className="w-full text-sm"
              >
                Go to dashboard
              </Button>
            </div>
          )}
          {status === "error" && (
            <div className="flex flex-col items-center gap-3">
              <XCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground">
                {error || "Verification failed. Please try again."}
              </p>
              <Link to="/login" className="w-full">
                <Button variant="outline" className="w-full text-sm">
                  Back to sign in
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

export default VerifyEmail;
