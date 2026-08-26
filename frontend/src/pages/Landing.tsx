import { Link } from "react-router-dom";
import {
  Radar,
  Globe,
  Smartphone,
  CalendarClock,
  Users,
  Shield,
  Coins,
  ArrowRight,
  Server,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { BrandMark } from "@/components/brand/BrandMark";
import { BRAND } from "@/lib/brand";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import ThemeSwitcher from "@/components/theme/ThemeSwitcher";
import { useTranslation } from "react-i18next";

const pipelineSteps = [
  { titleKey: "stepScan", descKey: "stepScanDesc" },
  { titleKey: "stepAttach", descKey: "stepAttachDesc" },
  { titleKey: "stepWorkspace", descKey: "stepWorkspaceDesc" },
  { titleKey: "stepGuard", descKey: "stepGuardDesc" },
] as const;

const featureKeys = [
  { icon: Radar, titleKey: "featIp", descKey: "featIpDesc" },
  { icon: Globe, titleKey: "featDomain", descKey: "featDomainDesc" },
  { icon: Smartphone, titleKey: "featMobile", descKey: "featMobileDesc" },
  { icon: CalendarClock, titleKey: "featAttach", descKey: "featAttachDesc" },
  { icon: Users, titleKey: "featWorkspace", descKey: "featWorkspaceDesc" },
  { icon: Server, titleKey: "featAssets", descKey: "featAssetsDesc" },
  { icon: Shield, titleKey: "featGuard", descKey: "featGuardDesc" },
  { icon: Activity, titleKey: "featUptime", descKey: "featUptimeDesc" },
  { icon: Coins, titleKey: "featCredits", descKey: "featCreditsDesc" },
] as const;

const faqKeys = [
  { q: "faqAuthQ", a: "faqAuthA" },
  { q: "faqPentestQ", a: "faqPentestA" },
  { q: "faqDataQ", a: "faqDataA" },
  { q: "faqGuardQ", a: "faqGuardA" },
] as const;

function Landing() {
  const { t } = useTranslation("landing");
  const { t: tc } = useTranslation("common");
  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-12 w-full max-w-6xl min-w-0 items-center justify-between gap-2 overflow-x-hidden px-4 2xl:max-w-[90rem]">
          <BrandMark to="/" />
          <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
            <a
              href="/blog"
              className="hidden sm:inline-flex min-h-11 items-center text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("blog")}
            </a>
            <div className="hidden sm:flex sm:items-center sm:gap-2">
              <ThemeSwitcher />
              <LanguageSwitcher />
            </div>
            <Link to="/login" className="hidden sm:inline">
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 text-xs border-muted-foreground/50 text-foreground hover:border-foreground/40 hover:bg-accent"
              >
                {tc("signIn")}
              </Button>
            </Link>
            <Link to="/register" className="hidden sm:inline">
              <Button size="sm" className="min-h-11 text-xs">
                {tc("getStarted")}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="flex flex-col items-center px-4 pt-16 pb-12 sm:pt-20">
          <div className="mx-auto max-w-3xl space-y-6 text-center 2xl:max-w-4xl">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              {t("heroEyebrow")}
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              {t("heroHeadline")}
            </h1>
            <p className="text-base sm:text-lg text-foreground/80">
              {t("heroSub")}
            </p>
            <div className="flex w-full max-w-sm flex-col sm:max-w-none sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-2 mx-auto">
              <Link to="/register" className="w-full sm:w-auto">
                <Button size="lg" className="w-full text-sm min-h-11">
                  {tc("getStarted")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/login" className="w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full text-sm min-h-11 border-muted-foreground/50 text-foreground hover:border-foreground/40 hover:bg-accent"
                >
                  {tc("signIn")}
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="px-4 py-12">
          <div className="mx-auto max-w-6xl 2xl:max-w-[90rem]">
            <div className="text-center mb-10 space-y-2">
              <p className="text-xs tracking-wide text-muted-foreground uppercase">
                {tc("pipeline")}
              </p>
              <h2 className="text-2xl font-bold tracking-wide text-foreground">
                {t("howItWorks")}
              </h2>
            </div>
            <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {pipelineSteps.map((step, i) => (
                <li
                  key={step.titleKey}
                  className="rounded-lg border border-border bg-card p-4 text-left"
                >
                  <p className="text-xs text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </p>
                  <p className="mt-1 text-sm font-semibold tracking-wide">
                    {t(step.titleKey)}
                  </p>
                  <p className="mt-2 text-sm text-foreground/75">
                    {t(step.descKey)}
                  </p>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              {t("siemNote")}
            </p>
          </div>
        </section>

        <section className="px-4 py-12 bg-card/50">
          <div className="mx-auto max-w-6xl 2xl:max-w-[90rem]">
            <div className="text-center mb-10 space-y-2">
              <h2 className="text-2xl font-bold tracking-wide text-foreground">
                {t("whatShips")}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {featureKeys.map((feature) => (
                <Card
                  key={feature.titleKey}
                  className="hover:border-primary/40 transition-colors"
                >
                  <CardHeader>
                    <feature.icon className="h-8 w-8 text-primary mb-2" />
                    <CardTitle className="text-sm tracking-wide">
                      {t(feature.titleKey)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-foreground/75">
                      {t(feature.descKey)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-12">
          <div className="mx-auto max-w-3xl 2xl:max-w-4xl">
            <h2 className="mb-8 text-center text-2xl font-bold tracking-wide text-foreground">
              {t("faqTitle")}
            </h2>
            <dl className="space-y-6">
              {faqKeys.map((item) => (
                <div key={item.q}>
                  <dt className="text-sm font-semibold text-foreground">
                    {t(item.q)}
                  </dt>
                  <dd className="mt-1 text-sm text-foreground/75">{t(item.a)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="mt-auto shrink-0 border-t border-border py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 sm:flex-row sm:justify-between 2xl:max-w-[90rem]">
          <p className="text-xs text-foreground/70 text-center sm:text-left">
            {BRAND.footerLine}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 sm:hidden">
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>
          <div className="flex items-center gap-4 text-xs">
            <a
              href="/blog"
              className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("blog")}
            </a>
            <a
              href="/terms"
              className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("terms")}
            </a>
            <a
              href="/privacy"
              className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("privacy")}
            </a>
            <Link
              to="/login"
              className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
            >
              {tc("signIn")}
            </Link>
            <Link
              to="/register"
              className="inline-flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground"
            >
              {tc("getStarted")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
