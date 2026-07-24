import { Link } from "react-router-dom";
import { Crosshair, Radar, Globe, Smartphone, Shield, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";

const features = [
  {
    icon: Radar,
    title: "IP Scanner",
    description: "Port scanning with CVE lookup and severity scoring",
    bullets: [
      "Port scan (nmap)",
      "Service/version detect",
      "CVE lookup",
      "Severity scoring",
    ],
  },
  {
    icon: Globe,
    title: "Domain Scanner",
    description: "DNS, SSL/TLS, headers, and tech fingerprinting",
    bullets: [
      "DNS & subdomains",
      "SSL/TLS analysis",
      "Security headers",
      "Tech fingerprint",
    ],
  },
  {
    icon: Smartphone,
    title: "Mobile Scanner",
    description: "APK/IPA static analysis and secret detection",
    bullets: [
      "APK/IPA static analysis",
      "Permissions review",
      "Exported components",
      "Hardcoded secret scan",
    ],
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <Crosshair className="h-5 w-5 text-primary" />
            <span className="font-mono text-sm font-bold tracking-wider text-foreground">
              VULN<span className="text-primary">SCAN</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-xs border-border text-foreground"
              >
                Sign In
              </Button>
            </Link>
            <Link to="/register">
              <Button size="sm" className="font-mono text-xs">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="flex flex-col items-center px-4 pt-12 pb-10">
        <div className="text-center space-y-6 max-w-2xl">
          <div className="flex items-center justify-center gap-3">
            <Crosshair className="h-12 w-12 text-primary" />
          </div>
          <h1 className="font-mono text-4xl sm:text-5xl font-bold tracking-wide text-foreground">
            VulnScanner
          </h1>
          <p className="font-mono text-base sm:text-lg text-muted-foreground">
            Web-based vulnerability scanner — IP, domain, and mobile analysis
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Link to="/register">
              <Button size="lg" className="font-mono text-sm">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button
                variant="outline"
                size="lg"
                className="font-mono text-sm border-border text-foreground"
              >
                Sign In
              </Button>
            </Link>
          </div>
          <p className="font-mono text-xs text-muted-foreground pt-1">
            JWT auth · API key access · Docker Compose deploy
          </p>
        </div>
      </section>

      <section className="px-4 py-12 bg-card/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-mono text-lg font-bold tracking-wide text-foreground flex items-center justify-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Features
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="hover:border-primary/40 transition-colors">
                <CardHeader>
                  <feature.icon className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="font-mono text-sm tracking-wide">
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="font-mono text-xs text-muted-foreground">
                    {feature.description}
                  </p>
                  <ul className="space-y-1.5 font-mono text-xs text-muted-foreground">
                    {feature.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-6 border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 sm:flex-row sm:justify-between">
          <p className="font-mono text-xs text-muted-foreground text-center sm:text-left">
            VulnScanner v0.1.0 · IP, domain &amp; mobile vulnerability scanning
          </p>
          <div className="flex items-center gap-4 font-mono text-xs">
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
