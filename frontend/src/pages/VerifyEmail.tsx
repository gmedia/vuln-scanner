import { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { Shield, Loader2, CheckCircle, XCircle } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { verifyEmail, isLoading, error, clearError } = useAuthStore();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) return;

    const verify = async () => {
      clearError();
      const success = await verifyEmail(token);
      setStatus(success ? "success" : "error");
    };

    verify();
  }, [token, verifyEmail, clearError]);

  if (!token) {
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
