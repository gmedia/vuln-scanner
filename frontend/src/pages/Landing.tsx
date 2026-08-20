import { Link } from "react-router-dom";
import {
  Radar,
  Globe,
  Smartphone,
  CalendarClock,
  Users,
  Shield,
  Search,
  Coins,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { BrandMark } from "@/components/brand/BrandMark";
import { BRAND } from "@/lib/brand";

const features = [
  {
    icon: Radar,
    title: "IP scan",
    description:
      "Ports, services, and CVE severity on the hosts you already run.",
  },
  {
    icon: Globe,
    title: "Domain scan",
    description: "DNS, TLS, headers, and stack fingerprint for public sites.",
  },
  {
    icon: Smartphone,
    title: "Mobile scan",
    description: "Static APK/AAB/IPA: permissions, exports, hardcoded secrets.",
  },
  {
    icon: CalendarClock,
    title: "Scan Attach",
    description:
      "Schedules, baseline diff, and executive HTML — not one-shot nmap.",
  },
  {
    icon: Users,
    title: "Workspace",
    description:
      "Org, roles, and invites so ops and owners share one scan trail.",
  },
  {
    icon: Shield,
    title: "Guard",
    description:
      "Thin Wazuh: agent inventory, critical alerts, per-org enroll.",
  },
  {
    icon: Search,
    title: "SIEM",
    description: "Search + cases on the same workspace (not a second console).",
  },
  {
    icon: Coins,
    title: "Credits",
    description: "Personal credit wallet; each scan type has a clear cost.",
  },
];

function Landing() {
  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <BrandMark to="/" />
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-muted-foreground/50 text-foreground hover:border-foreground/40 hover:bg-accent"
              >
                Sign In
              </Button>
            </Link>
            <Link to="/register">
              <Button size="sm" className="text-xs">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="flex flex-col items-center px-4 pt-12 pb-10">
          <div className="text-center space-y-6 max-w-2xl">
            <div className="space-y-2">
              <h1 className="text-4xl sm:text-5xl font-bold tracking-wide text-foreground">
                {BRAND.heroTitle}
              </h1>
              <p className="text-lg sm:text-xl font-semibold tracking-wide text-primary">
                {BRAND.heroProduct}
              </p>
            </div>
            <p className="text-base sm:text-lg text-foreground/80">
              {BRAND.heroSub}
            </p>
            <div className="flex w-full max-w-sm flex-col sm:max-w-none sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-2 mx-auto">
              <Link to="/register" className="w-full sm:w-auto">
                <Button size="lg" className="w-full text-sm min-h-11">
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/login" className="w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full text-sm min-h-11 border-muted-foreground/50 text-foreground hover:border-foreground/40 hover:bg-accent"
                >
                  Sign In
                </Button>
              </Link>
            </div>
            <p className="text-xs text-foreground/70 pt-1">
              Scan → Attach → Workspace → Guard → SIEM
            </p>
          </div>
        </section>

        <section className="px-4 py-12 bg-card/50">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10 space-y-2">
              <p className="text-xs tracking-wide text-muted-foreground uppercase">
                Scan → Attach → Workspace → Guard → SIEM
              </p>
              <h2 className="text-2xl font-bold tracking-wide text-foreground">
                What ships
              </h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <Card
                  key={feature.title}
                  className="hover:border-primary/40 transition-colors"
                >
                  <CardHeader>
                    <feature.icon className="h-8 w-8 text-primary mb-2" />
                    <CardTitle className="text-sm tracking-wide">
                      {feature.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-foreground/75">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-auto shrink-0 border-t border-border py-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 sm:flex-row sm:justify-between">
          <p className="text-xs text-foreground/70 text-center sm:text-left">
            {BRAND.footerLine}
          </p>
          <div className="flex items-center gap-4 text-xs">
            <Link
              to="/login"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
