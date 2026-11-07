import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, Check, TriangleAlert, Wallet, WalletCards } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import PageHeader from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/patterns/EmptyState";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { WorkspaceNotice } from "@/components/workspace/WorkspaceShell";
import { apiErrorMessage } from "@/api/apiErrors";
import { getAiWallet, isAiDisabledError } from "@/api/ai";
import {
  createTopupOrder,
  getTopupPacks,
  type TopupMethod,
  type TopupPack,
} from "@/api/aiTopup";
import { formatIdr } from "@/components/admin/aiFormat";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

function PackCard({
  pack,
  selected,
  onSelect,
}: {
  readonly pack: TopupPack;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const { t } = useTranslation("topup");
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-testid={`topup-pack-${pack.id}`}
      onClick={onSelect}
      className={cn(
        "flex min-h-11 w-full flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors",
        "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:bg-muted/40",
      )}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{pack.label}</span>
        {selected ? (
          <Check className="h-4 w-4 shrink-0 text-primary-text" aria-hidden />
        ) : null}
      </span>
      <span className="font-mono text-xl font-semibold tabular-nums text-foreground">
        {formatIdr(pack.amount_idr)}
      </span>
      {pack.bonus_idr > 0 ? (
        <span className="text-xs text-primary-text">
          {t("packBonus", { amount: formatIdr(pack.bonus_idr) })}
        </span>
      ) : null}
    </button>
  );
}

export default function AiTopup() {
  const { t } = useTranslation("topup");
  const orgId = useAuthStore((s) => s.activeOrgId);
  const navigate = useNavigate();
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [method, setMethod] = useState<TopupMethod>("manual_transfer");

  const packsQuery = useQuery({
    queryKey: ["ai-topup-packs", orgId],
    queryFn: getTopupPacks,
    enabled: Boolean(orgId),
    retry: false,
  });
  const walletQuery = useQuery({
    queryKey: ["ai-wallet", orgId],
    queryFn: getAiWallet,
    enabled: Boolean(orgId),
    retry: false,
  });

  const packs = useMemo(() => {
    const items = packsQuery.data?.items ?? [];
    return [...items]
      .filter((pack) => pack.active)
      .sort((a, b) => a.sort_order - b.sort_order || a.amount_idr - b.amount_idr);
  }, [packsQuery.data]);

  const selectedPack = packs.find((pack) => pack.id === selectedPackId) ?? null;

  const createMut = useMutation({
    mutationFn: (input: { pack_id: string; method: TopupMethod }) =>
      createTopupOrder(input),
    onSuccess: (order) => {
      toast.success(t("createdToast"));
      navigate(`/ai/topup/${order.id}`);
    },
    onError: (err) => toast.error(apiErrorMessage(err, t("createError"))),
  });

  const featureOff = isAiDisabledError(packsQuery.error);

  return (
    <div className="w-full space-y-6" data-testid="ai-topup-page">
      <PageHeader
        leading={<Wallet className="h-6 w-6 shrink-0 text-primary-text" />}
        title={t("title")}
        description={t("subtitle")}
        actions={
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/ai">{t("backToAi")}</Link>
          </Button>
        }
      />

      {!orgId ? (
        <EmptyState
          titleTone="muted"
          icon={Building2}
          title={t("pickOrg")}
          testId="ai-topup-pick-org"
        />
      ) : packsQuery.isLoading ? (
        <div className="space-y-4" data-testid="ai-topup-loading">
          <Skeleton className="h-20 w-full rounded-lg" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
          </div>
        </div>
      ) : featureOff ? (
        <EmptyState
          titleTone="muted"
          icon={WalletCards}
          title={t("featureOff")}
          testId="ai-topup-feature-off"
        />
      ) : packsQuery.isError ? (
        <WorkspaceNotice tone="danger" role="status">
          <div className="space-y-2" data-testid="ai-topup-error">
            <p className="text-sm font-medium text-foreground">
              {t("loadErrorTitle")}
            </p>
            <p className="text-xs text-muted-foreground">{t("loadErrorBody")}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => void packsQuery.refetch()}
            >
              {t("retry")}
            </Button>
          </div>
        </WorkspaceNotice>
      ) : packs.length === 0 ? (
        <EmptyState
          titleTone="muted"
          icon={TriangleAlert}
          title={t("catalogEmptyTitle")}
          hint={t("catalogEmptyBody")}
          testId="ai-topup-empty"
        />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
              <span className="text-sm text-muted-foreground">
                {t("balanceLabel")}
              </span>
              {walletQuery.isLoading ? (
                <Skeleton className="h-6 w-28" />
              ) : (
                <span
                  className="font-mono text-lg font-semibold tabular-nums text-foreground"
                  data-testid="ai-topup-balance"
                >
                  {formatIdr(walletQuery.data?.balance_idr)}
                </span>
              )}
            </CardContent>
          </Card>

          <section className="space-y-3" aria-labelledby="ai-topup-packs-heading">
            <div className="space-y-1">
              <h3
                id="ai-topup-packs-heading"
                className="text-sm font-semibold text-foreground"
              >
                {t("packsTitle")}
              </h3>
              <p className="text-xs text-muted-foreground">{t("packsHint")}</p>
            </div>
            <div
              role="radiogroup"
              aria-label={t("packSelectLabel")}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {packs.map((pack) => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  selected={pack.id === selectedPackId}
                  onSelect={() => setSelectedPackId(pack.id)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-3" aria-labelledby="ai-topup-method-heading">
            <h3
              id="ai-topup-method-heading"
              className="text-sm font-semibold text-foreground"
            >
              {t("methodTitle")}
            </h3>
            <div
              role="group"
              aria-label={t("methodTitle")}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              <Button
                type="button"
                variant={method === "manual_transfer" ? "default" : "outline"}
                aria-pressed={method === "manual_transfer"}
                data-testid="ai-topup-method-manual"
                onClick={() => setMethod("manual_transfer")}
                className="h-auto min-h-11 justify-start gap-3 px-4 py-3 text-left"
              >
                <span className="flex flex-col items-start gap-0.5">
                  <span className="text-sm font-medium">{t("methodManual")}</span>
                  <span className="text-xs font-normal opacity-80">
                    {t("methodManualHint")}
                  </span>
                </span>
              </Button>
              <Button
                type="button"
                variant={method === "midtrans" ? "default" : "outline"}
                aria-pressed={method === "midtrans"}
                data-testid="ai-topup-method-midtrans"
                onClick={() => setMethod("midtrans")}
                className="h-auto min-h-11 justify-start gap-3 px-4 py-3 text-left"
              >
                <span className="flex flex-col items-start gap-0.5">
                  <span className="text-sm font-medium">
                    {t("methodMidtrans")}
                  </span>
                  <span className="text-xs font-normal opacity-80">
                    {t("methodMidtransHint")}
                  </span>
                </span>
              </Button>
            </div>
          </section>

          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedPack) return;
              createMut.mutate({ pack_id: selectedPack.id, method });
            }}
          >
            <Button
              type="submit"
              className="min-h-11 w-full sm:w-auto"
              disabled={!selectedPack || createMut.isPending}
              data-testid="ai-topup-submit"
            >
              {createMut.isPending ? t("creatingOrder") : t("createOrder")}
            </Button>
            {!selectedPack ? (
              <p className="text-xs text-muted-foreground">{t("noPackHint")}</p>
            ) : null}
          </form>
        </div>
      )}
    </div>
  );
}
