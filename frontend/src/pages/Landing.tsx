import { Link } from "react-router-dom";
import { Crosshair, Radar, Globe, Smartphone, Shield, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";

const features = [
  {
    icon: Radar,
    title: "IP Scanner",
    description: "Port scanning with CVE lookup",
  },
  {
    icon: Globe,
    title: "Domain Scanner",
    description: "SSL/TLS analysis & subdomain enumeration",
  },
  {
    icon: Smartphone,
    title: "Mobile Scanner",
    description: "APK/IPA static analysis & secret detection",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
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
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link to="/register">
              <Button size="lg" className="font-mono text-sm">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="outline" size="lg" className="font-mono text-sm">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="px-4 py-16 bg-card/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-mono text-lg font-bold tracking-wide text-foreground flex items-center justify-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              FEATURES
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
                <CardContent>
                  <p className="font-mono text-xs text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <footer className="py-6 text-center border-t border-border">
        <p className="font-mono text-xs text-muted-foreground">
          VulnScanner v0.1.0
        </p>
      </footer>
    </div>
  );
}

export default Landing;
