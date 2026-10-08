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
  FileText,
  Calculator,
  Mail,
  Sparkles,
  Receipt,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  AdminKpiTile,
  AdminShell,
  AdminShellBody,
  AdminShellHead,
} from "@/components/admin/AdminShell";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/Skeleton";
import { SiemRail } from "@/components/siem/siemChrome";
import PageHeader from "@/components/layout/PageHeader";
import { adminApi } from "@/api/admin";
import { useTranslation } from "react-i18next";

function AdminDashboard() {
  const { t } = useTranslation("admin");
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: adminApi.getStats,
    staleTime: 30_000,
  });

  const kpiChartConfig = {
    counts: { label: t("chartCount"), color: "hsl(142 71% 45%)" },
    credits: { label: t("chartCredits"), color: "hsl(217 91% 60%)" },
  } satisfies ChartConfig;

  const kpiTiles = [
    { kind: "users" as const, label: t("kpiUsers"), value: stats?.total_users ?? 0, icon: Users },
    { kind: "scans" as const, label: t("kpiScans"), value: stats?.total_scans ?? 0, icon: Radar },
    { kind: "findings" as const, label: t("kpiFindings"), value: stats?.total_findings ?? 0, icon: Shield },
    { kind: "creditsIn" as const, label: t("kpiCreditsIn"), value: stats?.credits_distributed ?? 0, icon: Coins },
    { kind: "creditsUsed" as const, label: t("kpiCreditsUsed"), value: stats?.credits_used ?? 0, icon: TrendingUp },
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
    {
      to: "/admin/hpp",
      label: t("linkHpp"),
      desc: t("linkHppDesc"),
      icon: Calculator,
    },
    {
      to: "/admin/invoices",
      label: t("linkInvoices"),
      desc: t("linkInvoicesDesc"),
      icon: Receipt,
    },
    {
      to: "/admin/blog",
      label: t("linkBlog"),
      desc: t("linkBlogDesc"),
      icon: FileText,
    },
    {
      to: "/admin/email-logs",
      label: t("linkEmailLogs"),
      desc: t("linkEmailLogsDesc"),
      icon: Mail,
    },
    {
      to: "/admin/ai",
      label: t("linkAi"),
      desc: t("linkAiDesc"),
      icon: Sparkles,
    },
  ];

  const charts: Array<{
    key: string;
    testid: string;
    title: string;
    bars?: string;
    data: Array<Record<string, string | number>>;
    dataKey: string;
    fill: string;
  }> = [
    {
      key: "counts",
      testid: "admin-kpi-chart",
      title: t("overview"),
      bars: "scans,findings",
      data: [
        { name: t("chartScans"), counts: stats?.total_scans ?? 0 },
        { name: t("chartFindings"), counts: stats?.total_findings ?? 0 },
      ],
      dataKey: "counts",
      fill: kpiChartConfig.counts.color,
    },
    {
      key: "credits",
      testid: "admin-credits-chart",
      title: t("chartCredits"),
      data: [
        { name: t("chartCreditsIn"), credits: stats?.credits_distributed ?? 0 },
        { name: t("chartCreditsUsed"), credits: stats?.credits_used ?? 0 },
      ],
      dataKey: "credits",
      fill: kpiChartConfig.credits.color,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        leading={<Shield className="h-6 w-6 shrink-0 text-primary" />}
        title={t("dashboardTitle")}
        description={t("dashboardSubtitle")}
      />

      <div className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-5">
        {kpiTiles.map((tile) => (
          <AdminKpiTile
            key={tile.kind}
            kind={tile.kind}
            label={tile.label}
            value={tile.value}
            icon={tile.icon}
            isLoading={isLoading && !stats}
          />
        ))}
      </div>

      <div className="grid gap-4 2xl:grid-cols-2">
        {charts.map((chart) => (
          <AdminShell key={chart.key} tone="primary">
            <AdminShellHead title={chart.title} />
            <AdminShellBody>
              {isLoading ? (
                <Skeleton className="aspect-auto h-[280px] w-full min-h-[220px] 2xl:h-[320px]" />
              ) : (
                <div data-testid={chart.testid} data-bars={chart.bars}>
                  <ChartContainer
                    config={kpiChartConfig}
                    className="aspect-auto h-[280px] w-full min-h-[220px] 2xl:h-[320px]"
                    initialDimension={{ width: 800, height: 280 }}
                  >
                    <BarChart
                      data={chart.data}
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
                        dataKey={chart.dataKey}
                        fill={chart.fill}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                </div>
              )}
            </AdminShellBody>
          </AdminShell>
        ))}
      </div>

      <AdminShell tone="primary">
        <AdminShellHead title={t("quickLinks")} />
        <AdminShellBody>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quickLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="group relative flex min-h-16 items-center gap-3 overflow-hidden rounded-md border border-border bg-secondary/40 py-4 pl-5 pr-5 transition-colors hover:border-primary/40 hover:bg-secondary"
              >
                <SiemRail className="bg-border transition-colors group-hover:bg-primary/40" />
                <span className="rounded-full bg-primary/10 p-2" aria-hidden>
                  <link.icon className="h-4 w-4 text-primary" />
                </span>
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
        </AdminShellBody>
      </AdminShell>
    </div>
  );
}

export default AdminDashboard;
