import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Crosshair, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BrandMark } from "@/components/brand/BrandMark";
import { useAuthStore } from "@/store/authStore";
import { useTranslation } from "react-i18next";

function NotFound() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const initialize = useAuthStore((s) => s.initialize);
  const { t } = useTranslation("landing");
  const { t: ta } = useTranslation("auth");

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
      <div className="flex w-full max-w-2xl flex-col items-center rounded-lg border border-border bg-card px-10 py-16 text-center 2xl:max-w-3xl">
        <div className="mb-6">
          <BrandMark to="/" aria-label={t("homeAria")} />
        </div>
        <div className="mb-4 rounded-full bg-muted p-4">
          <Crosshair className="h-10 w-10 text-primary/70" />
        </div>
        <h1 className="mb-2 font-mono text-7xl font-bold tracking-tighter text-foreground/85 sm:text-8xl 2xl:text-9xl">
          404
        </h1>
        <h2 className="mb-2 text-lg font-bold tracking-wide text-foreground">
          {t("notFoundTitle")}
        </h2>
        <p className="mb-6 max-w-md text-center text-sm text-foreground/75">
          {t("notFoundBody")}
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          {isAuthenticated ? (
            <>
              <Button asChild size="lg">
                <Link to="/dashboard">
                  <Crosshair className="mr-2 h-4 w-4" />
                  {t("returnDashboard")}
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-border text-foreground"
              >
                <Link to="/">{t("backHome")}</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild size="lg">
                <Link to="/">
                  <Crosshair className="mr-2 h-4 w-4" />
                  {t("backHome")}
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-border text-foreground"
              >
                <Link to="/login">{ta("signInCta")}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default NotFound;
