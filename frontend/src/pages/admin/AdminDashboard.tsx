import { useQuery } from "@tanstack/react-query";
import { Shield, Users, Radar, Coins, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { adminApi } from "@/api/admin";

function AdminDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: adminApi.getStats,
  });

  const statCards = [
    {
      label: "Total Users",
      value: stats?.total_users ?? 0,
      icon: Users,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Total Scans",
      value: stats?.total_scans ?? 0,
      icon: Radar,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Total Findings",
      value: stats?.total_findings ?? 0,
      icon: Shield,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
    },
    {
      label: "Credits Distributed",
      value: stats?.credits_distributed ?? 0,
      icon: Coins,
      color: "text-green-400",
      bg: "bg-green-500/10",
    },
    {
      label: "Credits Used",
      value: stats?.credits_used ?? 0,
      icon: TrendingUp,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <h2 className="font-mono text-lg font-bold tracking-wide text-foreground">
          ADMIN DASHBOARD
        </h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((card) => (
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
                  <span className={`font-mono text-2xl font-bold tracking-tight ${card.color}`}>
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
    </div>
  );
}

export default AdminDashboard;
