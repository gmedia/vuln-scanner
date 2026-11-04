import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, Minus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Footer } from "@/components/Footer";
import { PublicHeader } from "@/components/public/PublicHeader";
import NotFound from "@/pages/NotFound";
import { usePageMeta } from "@/lib/seo";
import {
  capabilityLabelKey,
  capabilityNoteKey,
  getService,
  statusLabelKey,
  type ServiceStatus,
} from "@/lib/services";

function statusVariant(
  status: ServiceStatus,
): "success" | "pending" | "info" | "default" {
  if (status === "live") return "success";
  if (status === "limited") return "pending";
  if (status === "by_request" || status === "beta") return "info";
  return "default";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

type Step = { title: string; body: string };

function stepList(value: unknown): Step[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.title !== "string" || typeof record.body !== "string") {
      return [];
    }
    return [{ title: record.title, body: record.body }];
  });
}

function ProductPage() {
  const { slug = "" } = useParams();
  const { t } = useTranslation("products");
  const service = getService(slug);

  usePageMeta(
    service
      ? {
          title: t(service.metaTitleKey),
          description: t(service.metaDescriptionKey),
          canonical: `/products/${service.slug}`,
          robots: "index",
        }
      : {
          title: t("labels.notFoundMetaTitle"),
          description: t("labels.notFoundMetaDescription"),
          canonical: `/products/${slug}`,
          robots: "noindex",
        },
  );

  if (!service) {
    return <NotFound />;
  }

  const requestAccess = service.status !== "live";

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <PublicHeader />

      <main className="flex-1 px-4 py-12">
        <div className="mx-auto max-w-6xl 2xl:max-w-[90rem]">
          <Link
            to="/products"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t("labels.backToProducts")}
          </Link>

          <header className="mt-6 max-w-3xl space-y-4">
            <Badge variant={statusVariant(service.status)}>
              {t(statusLabelKey(service.status))}
            </Badge>
            <h1 className="text-pretty text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {t(service.nameKey)}
            </h1>
            <p className="text-pretty text-base leading-relaxed text-muted-foreground">
              {t(`services.${service.slug}.intro`)}
            </p>
            <div className="space-y-2 pt-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("labels.capabilities")}
              </h2>
              <ul className="space-y-2">
                {service.capabilities.map((capability) => {
                  const noteKey = capabilityNoteKey(service.slug, capability);
                  return (
                    <li
                      key={capability.key}
                      className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm"
                    >
                      <Badge variant={statusVariant(capability.status)}>
                        {t(statusLabelKey(capability.status))}
                      </Badge>
                      <span className="font-medium text-foreground">
                        {t(capabilityLabelKey(service.slug, capability))}
                      </span>
                      {noteKey ? (
                        <span className="w-full text-sm leading-relaxed text-muted-foreground sm:w-auto sm:flex-1">
                          {t(noteKey)}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          </header>

          <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("labels.whatItDoes")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {stringList(
                    t(`services.${service.slug}.whatItDoes`, {
                      returnObjects: true,
                    }),
                  ).map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"
                    >
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-primary-text"
                        aria-hidden
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("labels.whatItDoesNot")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {stringList(
                    t(`services.${service.slug}.doesNotDo`, {
                      returnObjects: true,
                    }),
                  ).map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"
                    >
                      <Minus
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <section className="mt-12">
            <h2 className="mb-5 text-xl font-bold tracking-wide text-foreground">
              {t("labels.howItWorks")}
            </h2>
            <ol className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {stepList(
                t(`services.${service.slug}.steps`, { returnObjects: true }),
              ).map((step, index) => (
                <li
                  key={step.title}
                  className="flex h-full min-h-[8.5rem] flex-col rounded-lg border border-border bg-card p-4 text-left"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40 font-mono text-xs font-medium text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="mt-2 text-sm font-semibold tracking-wide text-foreground">
                    {step.title}
                  </p>
                  <p className="mt-2 flex-1 text-pretty text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-12">
            <h2 className="mb-5 text-xl font-bold tracking-wide text-foreground">
              {t("labels.requirements")}
            </h2>
            <Card>
              <CardContent className="pt-4">
                <ul className="space-y-2">
                  {stringList(
                    t(`services.${service.slug}.requirements`, {
                      returnObjects: true,
                    }),
                  ).map((item) => (
                    <li
                      key={item}
                      className="text-sm leading-relaxed text-muted-foreground"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          <section className="mt-12">
            <Card className="p-6">
              <h2 className="text-xl font-bold tracking-wide text-foreground">
                {t("labels.nextStep")}
              </h2>
              {requestAccess ? (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t("labels.enablementNote")}
                </p>
              ) : null}
              <div className="mt-4">
                <Button asChild className="min-h-11">
                  <Link to="/register">
                    {requestAccess ? t("cta.requestAccess") : t("cta.getStarted")}
                  </Link>
                </Button>
              </div>
            </Card>
          </section>

          <section className="mt-12">
            <h2 className="mb-5 text-xl font-bold tracking-wide text-foreground">
              {t("labels.related")}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {service.related.map((relatedSlug) => {
                const related = getService(relatedSlug);
                if (!related) return null;
                return (
                  <Card
                    key={related.slug}
                    data-testid={`related-${related.slug}`}
                    className="h-full transition-colors hover:border-primary/40"
                  >
                    <CardHeader>
                      <CardTitle className="text-sm tracking-wide">
                        {t(related.nameKey)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-4">
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {t(related.summaryKey)}
                      </p>
                      <div className="mt-auto">
                        <Button
                          asChild
                          variant="link"
                          className="h-auto min-h-11 px-0 text-sm"
                        >
                          <Link to={`/products/${related.slug}`}>
                            {t("hub.cardLink", {
                              name: t(related.nameKey),
                            })}
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default ProductPage;
