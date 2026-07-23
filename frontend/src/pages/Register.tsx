import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Crosshair, Loader2, CheckCircle } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";

function Register() {
  const navigate = useNavigate();
  const { register, error, isAuthenticated, clearError } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      setValidationError("Kata sandi minimal 8 karakter");
      return;
    }
    if (password !== confirmPassword) {
      setValidationError("Kata sandi tidak cocok");
      return;
    }

    setIsSubmitting(true);
    const ok = await register(email, password, confirmPassword);
    if (!mountedRef.current) return;
    if (ok) {
      setSuccess(true);
    } else {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-primary mx-auto" />
            <h2 className="font-mono text-lg font-bold tracking-wide text-foreground">
              Registration Successful!
            </h2>
            <p className="font-mono text-xs text-muted-foreground">
              Check your email to verify your account.
            </p>
            <Link to="/login">
              <Button className="w-full font-mono text-sm mt-4">
                Go to Sign In
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
            Create Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {(error || validationError) && (
              <p className="font-mono text-xs text-red-400 text-center">
                {validationError || error}
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
            <div className="space-y-2">
              <label htmlFor="password" className="block font-mono text-xs text-muted-foreground">
                Password
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
            <Button type="submit" className="w-full font-mono text-sm" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                "Create Account"
              )}
            </Button>
          </form>
          <p className="mt-6 text-center font-mono text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default Register;
