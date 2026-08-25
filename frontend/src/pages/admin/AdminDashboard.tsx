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
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/Skeleton";
import { adminApi } from "@/api/admin";
import { useTranslation } from "react-i18next";

function AdminDashboard() {
  const { t } = useTranslation("admin");
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: adminApi.getStats,
  });

  const kpiChartConfig = {
    counts: { label: t("chartCount"), color: "hsl(142 71% 45%)" },
    credits: { label: t("chartCredits"), color: "hsl(217 91% 60%)" },
  } satisfies ChartConfig;

  const countCards = [
    {
      label: t("kpiUsers"),
      value: stats?.total_users ?? 0,
      icon: Users,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: t("kpiScans"),
      value: stats?.total_scans ?? 0,
      icon: Radar,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: t("kpiFindings"),
      value: stats?.total_findings ?? 0,
      icon: Shield,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
    },
  ];

  const creditCards = [
    {
      label: t("kpiCreditsIn"),
      value: stats?.credits_distributed ?? 0,
      icon: Coins,
      color: "text-green-400",
      bg: "bg-green-500/10",
    },
    {
      label: t("kpiCreditsUsed"),
      value: stats?.credits_used ?? 0,
      icon: TrendingUp,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
    },
  ];

  const quickLinks = [
    {
      to: "/admin/users",
      label: t("linkUsers"),
      desc: t("linkUsersDesc"),
      icon: Users,
    },
    {
      to: "/admin/pricing",
      label: t("linkPricing"),
      desc: t("linkPricingDesc"),
      icon: Tag,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-lg font-bold tracking-wide text-foreground">
            {t("dashboardTitle")}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {t("dashboardSubtitle")}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {[...countCards, ...creditCards].map((card) => (
            <Card key={card.label} className="border-border">
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
                      className={`font-mono text-2xl font-bold tracking-tight tabular-nums ${card.color}`}
                    >
                      {card.value.toLocaleString()}
                    </span>
                    <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {card.label}
                    </span>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">{t("overview")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : (
            <div data-testid="admin-kpi-chart">
              <ChartContainer
                config={kpiChartConfig}
                className="aspect-auto h-[280px] w-full min-h-[220px] 2xl:h-[320px]"
                initialDimension={{ width: 800, height: 280 }}
              >
                <BarChart
                  data={[
                    {
                      name: t("chartUsers"),
                      counts: stats?.total_users ?? 0,
                    },
                    {
                      name: t("chartScans"),
                      counts: stats?.total_scans ?? 0,
                    },
                    {
                      name: t("chartFindings"),
                      counts: stats?.total_findings ?? 0,
                    },
                  ]}
                  margin={{ left: 12, right: 12, top: 8, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={(n) => Number(n).toLocaleString()}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel />}
                  />
                  <Bar
                    dataKey="counts"
                    fill="var(--color-counts)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">{t("chartCredits")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : (
            <div data-testid="admin-credits-chart">
              <ChartContainer
                config={kpiChartConfig}
                className="aspect-auto h-[280px] w-full min-h-[220px] 2xl:h-[320px]"
                initialDimension={{ width: 800, height: 280 }}
              >
                <BarChart
                  data={[
                    {
                      name: t("chartCreditsIn"),
                      credits: stats?.credits_distributed ?? 0,
                    },
                    {
                      name: t("chartCreditsUsed"),
                      credits: stats?.credits_used ?? 0,
                    },
                  ]}
                  margin={{ left: 12, right: 12, top: 8, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={(n) => Number(n).toLocaleString()}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel />}
                  />
                  <Bar
                    dataKey="credits"
                    fill="var(--color-credits)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">
            {t("quickLinks")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {quickLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="group flex min-h-16 items-center gap-3 rounded-md border border-border bg-secondary/40 px-5 py-4 transition-colors hover:border-primary/40 hover:bg-secondary"
              >
                <div className="rounded-full bg-primary/10 p-2">
                  <link.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{link.label}</p>
                  <p className="text-[11px] text-muted-foreground">
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
