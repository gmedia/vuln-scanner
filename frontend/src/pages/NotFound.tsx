import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Crosshair, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BrandMark } from "@/components/brand/BrandMark";
import { BRAND } from "@/lib/brand";
import { useAuthStore } from "@/store/authStore";

function NotFound() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

    return (
    <div className="flex min-h-dvh flex-col items-center bg-background px-4 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))] sm:justify-center sm:py-10">
      <div className="flex w-full max-w-lg flex-col items-center text-center">
        <div className="mb-6">
          <BrandMark to="/" aria-label={BRAND.homeAriaLabel} />
        </div>
        <div className="mb-4 rounded-full bg-muted p-4">
          <Crosshair className="h-10 w-10 text-primary/70" />
        </div>
        <h1 className="mb-2 font-mono text-7xl font-bold tracking-tighter text-foreground/85 sm:text-8xl">
          404
        </h1>
        <h2 className="mb-2 text-lg font-bold tracking-wide text-foreground">
          Page not found
        </h2>
        <p className="mb-6 max-w-md text-center text-sm text-foreground/75">
          The target you&apos;re looking for is out of scan range. Return to base
          and try again.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          {isAuthenticated ? (
            <>
              <Button asChild size="lg">
                <Link to="/dashboard">
                  <Crosshair className="mr-2 h-4 w-4" />
                  Return to dashboard
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-border text-foreground"
              >
                <Link to="/">Back to home</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild size="lg">
                <Link to="/">
                  <Crosshair className="mr-2 h-4 w-4" />
                  Back to home
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-border text-foreground"
              >
                <Link to="/login">Sign in</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default NotFound;
