import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Footer } from "@/components/Footer";
import { PublicHeader } from "@/components/public/PublicHeader";
import { usePageMeta } from "@/lib/seo";
import {
  PILLARS,
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

function Products() {
  const { t } = useTranslation("products");

  usePageMeta({
    title: t("hub.metaTitle"),
    description: t("hub.metaDescription"),
    canonical: "/products",
    robots: "index",
  });

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <PublicHeader />

      <main className="flex-1 px-4 py-12">
        <div className="mx-auto max-w-6xl 2xl:max-w-[90rem]">
          <header className="max-w-3xl space-y-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("hub.eyebrow")}
            </p>
            <h1 className="text-pretty text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {t("hub.title")}
            </h1>
            <p className="text-pretty text-base leading-relaxed text-muted-foreground">
              {t("hub.sub")}
            </p>
          </header>

          <div className="mt-12 space-y-12">
            {PILLARS.map((pillar) => (
              <section
                key={pillar.id}
                id={pillar.id}
                aria-labelledby={`pillar-${pillar.id}`}
                className="scroll-mt-16"
              >
                <div className="mb-5 max-w-2xl space-y-1.5">
                  <h2
                    id={`pillar-${pillar.id}`}
                    className="text-xl font-bold tracking-wide text-foreground"
                  >
                    {t(pillar.titleKey)}
                  </h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t(pillar.blurbKey)}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {pillar.slugs.map((slug) => {
                    const service = getService(slug);
                    if (!service) return null;
                    const status = t(statusLabelKey(service.status));
                    return (
                      <Card
                        key={service.slug}
                        data-testid={`product-card-${service.slug}`}
                        className="h-full transition-colors hover:border-primary/40"
                      >
                        <CardHeader>
                          <div className="flex items-start justify-between gap-3">
                            <CardTitle className="text-sm tracking-wide">
                              {t(service.nameKey)}
                            </CardTitle>
                            <Badge variant={statusVariant(service.status)}>
                              {status}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="flex flex-1 flex-col gap-4">
                          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                            {t(service.summaryKey)}
                          </p>
                          <div className="mt-auto">
                            <Button
                              asChild
                              variant="link"
                              className="h-auto min-h-11 px-0 text-sm"
                            >
                              <Link to={`/products/${service.slug}`}>
                                {t("hub.cardLink", {
                                  name: t(service.nameKey),
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
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default Products;
