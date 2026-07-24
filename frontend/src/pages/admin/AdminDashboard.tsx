import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Shield,
  Users,
  Radar,
  Coins,
  TrendingUp,
  ArrowRight,
  Tag,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { adminApi } from "@/api/admin";

function AdminDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: adminApi.getStats,
  });

  const statCards = [
    {
      label: "Total users",
      value: stats?.total_users ?? 0,
      icon: Users,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      span: "lg:col-span-2",
    },
    {
      label: "Total scans",
      value: stats?.total_scans ?? 0,
      icon: Radar,
      color: "text-primary",
      bg: "bg-primary/10",
      span: "lg:col-span-2",
    },
    {
      label: "Total findings",
      value: stats?.total_findings ?? 0,
      icon: Shield,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      span: "lg:col-span-2",
    },
    {
      label: "Credits distributed",
      value: stats?.credits_distributed ?? 0,
      icon: Coins,
      color: "text-green-400",
      bg: "bg-green-500/10",
      span: "lg:col-span-3",
    },
    {
      label: "Credits used",
      value: stats?.credits_used ?? 0,
      icon: TrendingUp,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      span: "lg:col-span-3",
    },
  ];

  const quickLinks = [
    {
      to: "/admin/users",
      label: "User management",
      desc: "Search, view, and adjust user accounts",
      icon: Users,
    },
    {
      to: "/admin/pricing",
      label: "Pricing",
      desc: "Configure scan credit costs",
      icon: Tag,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h2 className="font-mono text-lg font-bold tracking-wide text-foreground">
            Admin dashboard
          </h2>
          <p className="font-mono text-[11px] text-muted-foreground">
            All-time overview
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {statCards.map((card) => (
          <Card key={card.label} className={`border-border ${card.span}`}>
            <CardContent className="flex flex-col items-center justify-center p-4">
              {isLoading ? (
                <>
                  <Skeleton className="mb-2 h-8 w-16" />
                  <Skeleton className="h-3 w-20" />
                </>
              ) : (
                <>
                  <div className={`mb-2 rounded-full p-2 ${card.bg}`}>
                    <card.icon className={`h-4 w-4 ${card.color}`} />
                  </div>
                  <span
                    className={`font-mono text-2xl font-bold tracking-tight ${card.color}`}
                  >
                    {card.value.toLocaleString()}
                  </span>
                  <span className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {card.label}
                  </span>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-sm tracking-wide">
            Quick links
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {quickLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="group flex items-center gap-3 rounded-md border border-border bg-secondary/40 px-4 py-3 transition-colors hover:border-primary/40 hover:bg-secondary"
              >
                <div className="rounded-full bg-primary/10 p-2">
                  <link.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm text-foreground">{link.label}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {link.desc}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminDashboard;
