import { AlertTriangle, Monitor, RefreshCw } from "lucide-react";
import { GuardAlertsPanel } from "@/components/guard/GuardAlertsPanel";
import { GuardAgentsPanel } from "@/components/guard/GuardAgentsPanel";
import { GuardEnrollPanel } from "@/components/guard/GuardEnrollPanel";
import {
  GuardKpiSkeleton,
  GuardKpiStrip,
} from "@/components/guard/GuardKpiStrip";
import { GuardHostTokenOnce } from "@/components/guard/GuardOnceSecret";
import { useGuardConsole } from "@/components/guard/useGuardConsole";
import { SiemEmptyIsland } from "@/components/siem/SiemEmptyIsland";
import { isAuthSessionError } from "@/components/siem/siemErrors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/Button";
import PageHeader from "@/components/layout/PageHeader";

export default function Guard() {
  const g = useGuardConsole();

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title={g.t("title")}
        description={g.t("subtitle")}
        actions={
          g.canAdmin && !g.enabled ? (
            <Button
              onClick={() => g.enableMut.mutate()}
              disabled={g.enableMut.isPending}
            >
              {g.t("enable")}
            </Button>
          ) : g.canAdmin && g.enabled ? (
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 w-full shrink-0 text-xs sm:w-auto"
              onClick={() => g.syncMut.mutate()}
              disabled={g.syncMut.isPending}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {g.t("sync")}
            </Button>
          ) : null
        }
      />

      {g.actionError ? (
        <Alert variant="destructive" className="border-destructive/40">
          <AlertTriangle />
          <AlertDescription>{g.actionError}</AlertDescription>
        </Alert>
      ) : null}

      {g.statusQ.isLoading ? <GuardKpiSkeleton /> : null}

      {g.statusQ.isError ? (
        <p className="text-sm text-destructive" data-testid="guard-status-error">
          {isAuthSessionError(g.statusQ.error)
            ? g.t("sessionExpired")
            : g.t("loadStatusFail")}
        </p>
      ) : null}

      {g.statusQ.data ? (
        <GuardKpiStrip
          status={g.statusQ.data}
          agentCount={g.agentsQ.data?.length ?? 0}
          alertCount={g.alertsQ.data?.length ?? 0}
          dateLocale={g.dateLocale}
          t={g.t}
        />
      ) : null}

      {g.statusQ.data?.last_sync_error ? (
        <Alert className="border-amber-500/40 text-amber-800 dark:text-amber-300">
          <AlertTriangle />
          <AlertDescription>{g.statusQ.data.last_sync_error}</AlertDescription>
        </Alert>
      ) : null}

      {g.statusQ.data?.wazuh_group ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 px-2 text-xs text-foreground"
            onClick={() => g.setShowTechDetails((v) => !v)}
          >
            {g.showTechDetails ? g.t("hideTech") : g.t("showTech")}
          </Button>
          {g.showTechDetails ? (
            <code className="text-xs text-muted-foreground">
              {g.statusQ.data.wazuh_group}
            </code>
          ) : null}
        </div>
      ) : null}

      {!g.enabled && !g.statusQ.isLoading && !g.statusQ.isError ? (
        <SiemEmptyIsland
          icon={Monitor}
          title={g.t("disabledHint")}
          testId="guard-disabled"
        />
      ) : null}

      {g.enabled ? (
        <>
          {g.canAdmin ? (
            <GuardEnrollPanel
              tokenLabel={g.tokenLabel}
              onLabelChange={g.setTokenLabel}
              createPending={g.tokenMut.isPending}
              onCreate={() => g.tokenMut.mutate()}
              rawToken={g.rawToken}
              enrollCurl={g.enrollCurl}
              curlCopied={g.curlCopied}
              onCopyCurl={() => {
                void navigator.clipboard
                  ?.writeText(g.enrollCurl)
                  .then(() => {
                    g.setCurlCopied(true);
                    window.setTimeout(() => g.setCurlCopied(false), 2000);
                  })
                  .catch(() => undefined);
              }}
              loading={g.tokensQ.isLoading}
              tokens={g.tokens}
              visibleTokens={g.visibleTokens}
              tokenExpired={g.tokenExpired}
              nowMs={g.nowMs}
              dateLocale={g.dateLocale}
              showAllTokens={g.showAllTokens}
              unusedCount={g.unusedCount}
              revokePending={g.revokeMut.isPending}
              onToggleMore={() => g.setShowAllTokens((v) => !v)}
              onRevoke={(id) => g.revokeMut.mutate(id)}
              t={g.t}
            />
          ) : null}

          {g.hostTokenPlain ? (
            <GuardHostTokenOnce
              token={g.hostTokenPlain}
              agentId={g.hostTokenAgentId}
              copied={g.hostTokenCopied}
              onCopy={() => {
                void navigator.clipboard
                  ?.writeText(g.hostTokenPlain ?? "")
                  .then(() => g.setHostTokenCopied(true))
                  .catch(() => undefined);
              }}
              t={g.t}
            />
          ) : null}

          <GuardAgentsPanel
            loading={g.agentsQ.isLoading}
            agents={g.agentsQ.data ?? []}
            canAdmin={g.canAdmin}
            assets={g.assetsQ.data ?? []}
            dateLocale={g.dateLocale}
            hostTokenPending={g.hostTokenMut.isPending}
            disablePending={g.disableMut.isPending}
            onIssueHostToken={(id) => g.hostTokenMut.mutate(id)}
            onDisable={(id) => g.disableMut.mutate(id)}
            onLink={(agentId, assetId) =>
              g.linkMut.mutate({ agentId, assetId })
            }
            t={g.t}
          />

          <GuardAlertsPanel
            loading={g.alertsQ.isLoading}
            alerts={g.alertsQ.data ?? []}
            dateLocale={g.dateLocale}
            t={g.t}
          />
        </>
      ) : null}
    </div>
  );
}
