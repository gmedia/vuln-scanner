import { Link } from "react-router-dom";
import { ArrowRight, Menu } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";
import { BrandMark } from "@/components/brand/BrandMark";
import { Footer } from "@/components/Footer";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import ThemeSwitcher from "@/components/theme/ThemeSwitcher";
import { useTranslation } from "react-i18next";
import { BRAND } from "@/lib/brand";
import { usePageMeta } from "@/lib/seo";
import { getService, PILLARS } from "@/lib/services";

const attachSteps = [
  { titleKey: "stepConnect", descKey: "stepConnectDesc" },
  { titleKey: "stepWatch", descKey: "stepWatchDesc" },
  { titleKey: "stepProve", descKey: "stepProveDesc" },
] as const;

const faqKeys = [
  { q: "faqAuthQ", a: "faqAuthA" },
  { q: "faqPentestQ", a: "faqPentestA" },
  { q: "faqDataQ", a: "faqDataA" },
  { q: "faqGuardQ", a: "faqGuardA" },
  { q: "faqAgentQ", a: "faqAgentA" },
  { q: "faqAiQ", a: "faqAiA" },
] as const;

const navLinkClass =
  "hidden sm:inline-flex min-h-11 items-center text-xs text-muted-foreground transition-colors hover:text-foreground";

function Landing() {
  const { t } = useTranslation("landing");
  const { t: tc } = useTranslation("common");
  const { t: tp } = useTranslation("products");

  usePageMeta({
    title: BRAND.metaTitle,
    description: BRAND.metaDescription,
    canonical: "/",
  });

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-12 w-full max-w-6xl min-w-0 items-center justify-between gap-2 overflow-x-hidden px-4 2xl:max-w-[90rem]">
          <div className="shrink-0">
            <BrandMark to="/" />
          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
            <Link to="/products" className={navLinkClass}>
              {tp("nav.products")}
            </Link>
            <a href="/blog" className={navLinkClass}>
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
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 min-w-11 sm:hidden"
                  aria-label={tc("menu", { defaultValue: "Menu" })}
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-72 sm:max-w-sm"
                closeLabel={t("common:close")}
              >
                <SheetHeader>
                  <SheetTitle>{tc("menu", { defaultValue: "Menu" })}</SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-3 px-4 pb-6">
                  <Link
                    to="/products"
                    className="inline-flex min-h-11 items-center text-sm text-foreground"
                  >
                    {tp("nav.products")}
                  </Link>
                  <a
                    href="/blog"
                    className="inline-flex min-h-11 items-center text-sm text-foreground"
                  >
                    {t("blog")}
                  </a>
                  <ThemeSwitcher className="w-full" />
                  <LanguageSwitcher className="w-full" />
                  <Link to="/login">
                    <Button
                      variant="outline"
                      className="w-full min-h-11 border-muted-foreground/50 text-foreground"
                    >
                      {tc("signIn")}
                    </Button>
                  </Link>
                  <Link to="/register">
                    <Button className="w-full min-h-11">{tc("getStarted")}</Button>
                  </Link>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="flex flex-col items-center px-4 pt-16 pb-12 sm:pt-20">
          <div className="mx-auto max-w-3xl space-y-6 text-center 2xl:max-w-4xl">
            <p className="text-balance text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("heroEyebrow")}
            </p>
            <h1 className="text-pretty text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              {t("heroHeadline")}
            </h1>
            <p className="text-pretty text-base text-muted-foreground sm:text-lg">
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
            <div
              data-testid="landing-loop"
              className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-center gap-x-2 gap-y-1.5 rounded-lg border border-border bg-card px-4 py-3"
            >
              {attachSteps.map((step, i) => (
                <span key={step.titleKey} className="inline-flex items-center gap-2">
                  {i > 0 ? (
                    <ArrowRight
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  ) : null}
                  <span className="font-mono text-xs font-medium tracking-wide text-foreground">
                    {t(step.titleKey)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-12">
          <div className="mx-auto max-w-6xl 2xl:max-w-[90rem]">
            <div className="mb-10 text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-wide text-foreground">
                {t("pillarsTitle")}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
              {PILLARS.map((pillar) => {
                const productNames = pillar.slugs
                  .map((slug) => {
                    const service = getService(slug);
                    return service ? tp(service.nameKey) : null;
                  })
                  .filter((name): name is string => Boolean(name));

                return (
                  <Link
                    key={pillar.id}
                    to={`/products#${pillar.id}`}
                    className="block h-full"
                  >
                    <Card
                      data-testid="pillar-card"
                      className="h-full transition-colors hover:border-primary/40"
                    >
                      <CardHeader>
                        <CardTitle className="text-sm tracking-wide">
                          {tp(pillar.titleKey)}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-1 flex-col gap-3">
                        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                          {tp(pillar.blurbKey)}
                        </p>
                        <p className="mt-auto font-mono text-xs tracking-wide text-foreground">
                          {productNames.join(" · ")}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section className="px-4 pb-12">
          <div className="mx-auto max-w-6xl 2xl:max-w-[90rem]">
            <p className="rounded-lg border border-border bg-card px-4 py-4 text-center text-pretty text-sm leading-relaxed text-foreground">
              {t("honestyBand")}
            </p>
          </div>
        </section>

        <section className="px-4 py-12 bg-card/50">
          <div className="mx-auto max-w-6xl 2xl:max-w-[90rem]">
            <div className="text-center mb-10 space-y-2">
              <h2 className="text-2xl font-bold tracking-wide text-foreground">
                {t("howItAttaches")}
              </h2>
            </div>
            <ol className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {attachSteps.map((step, i) => (
                <li
                  key={step.titleKey}
                  className="flex h-full min-h-[8.5rem] flex-col rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40 font-mono text-xs font-medium text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="mt-2 text-sm font-semibold tracking-wide text-foreground">
                    {t(step.titleKey)}
                  </p>
                  <p className="mt-2 flex-1 text-pretty hyphens-none text-sm leading-relaxed text-muted-foreground">
                    {t(step.descKey)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="px-4 py-12">
          <div className="mx-auto max-w-6xl 2xl:max-w-[90rem]">
            <div className="mb-10 text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-wide text-foreground">
                {t("faqTitle")}
              </h2>
            </div>
            <Accordion type="single" collapsible className="w-full rounded-lg border border-border bg-card px-4">
              {faqKeys.map((item) => (
                <AccordionItem key={item.q} value={item.q}>
                  <AccordionTrigger className="min-h-11 text-sm font-semibold text-foreground">
                    {t(item.q)}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                    {t(item.a)}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

export default Landing;
