import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Copy, WalletCards } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatIdr } from "@/components/admin/aiFormat";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

export function AiWalletPanel({
  balanceIdr,
  activeKeys,
  periodBilled,
  usageCount,
  walletLoading,
  keysLoading,
  usageLoading,
  isAdmin,
}: {
  readonly balanceIdr: number | undefined;
  readonly activeKeys: number;
  readonly periodBilled: number;
  readonly usageCount: number;
  readonly walletLoading: boolean;
  readonly keysLoading: boolean;
  readonly usageLoading: boolean;
  readonly isAdmin: boolean;
}) {
  const { t } = useTranslation("ai");
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);
  const baseUrl = `${window.location.origin}/v1`;
  const walletEmpty = balanceIdr == null || balanceIdr === 0;

  useEffect(() => {
    return () => {
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
    };
  }, []);

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardDescription>{t("baseUrlHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label={t("balance")}
            value={
              walletLoading ? (
                <Skeleton className="h-7 w-28" />
              ) : (
                formatIdr(balanceIdr)
              )
            }
          />
          <StatTile
            label={t("statKeys")}
            value={
              keysLoading ? <Skeleton className="h-7 w-12" /> : String(activeKeys)
            }
          />
          <StatTile
            label={t("statPeriod")}
            value={
              usageLoading ? (
                <Skeleton className="h-7 w-24" />
              ) : usageCount > 0 ? (
                formatIdr(periodBilled)
              ) : (
                "—"
              )
            }
          />
        </div>

        {walletEmpty && !walletLoading ? (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <WalletCards
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <p className="text-sm text-muted-foreground">{t("walletEmpty")}</p>
            </div>
            <Button type="button" size="sm" asChild className="shrink-0">
              <Link to={isAdmin ? "/admin/ai" : "/guide"}>{t("walletTopUp")}</Link>
            </Button>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("endpoint")}
          </p>
          <div className="flex max-sm:flex-col flex-wrap items-start sm:items-center gap-2">
            <code className="max-w-full min-w-0 flex-1 break-all rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground">
              {baseUrl}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => {
                void navigator.clipboard.writeText(baseUrl);
                setCopied(true);
                if (copiedTimer.current != null) {
                  window.clearTimeout(copiedTimer.current);
                }
                copiedTimer.current = window.setTimeout(() => {
                  setCopied(false);
                  copiedTimer.current = null;
                }, 2000);
              }}
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              {copied ? t("copied") : t("copyBase")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatTile({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}
