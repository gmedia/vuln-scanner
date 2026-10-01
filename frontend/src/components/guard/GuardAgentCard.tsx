import type { ScanAsset } from "@/api/assets";
import type { GuardAgent } from "@/api/guard";
import {
  DisableAgentButton,
  HostTokenIssueButton,
} from "@/components/guard/GuardAgentActions";
import {
  GuardAssetChip,
  GuardAssetSelect,
} from "@/components/guard/GuardAgentLink";
import { AgentStatusBadge, CopyableId } from "@/components/guard/guardChrome";
import {
  agentRailClass,
  formatWhen,
  type GuardTranslate,
} from "@/components/guard/guardFormat";
import { SiemRail } from "@/components/siem/siemChrome";
import { Badge } from "@/components/ui/Badge";

export type GuardAgentViewProps = {
  readonly agent: GuardAgent;
  readonly canAdmin: boolean;
  readonly assets: readonly ScanAsset[];
  readonly dateLocale: string;
  readonly hostTokenPending: boolean;
  readonly disablePending: boolean;
  readonly onIssueHostToken: (id: string) => void;
  readonly onDisable: (id: string) => void;
  readonly onLink: (agentId: string, assetId: string | null) => void;
  readonly t: GuardTranslate;
};

export function GuardAgentCard({
  agent,
  canAdmin,
  assets,
  dateLocale,
  hostTokenPending,
  disablePending,
  onIssueHostToken,
  onDisable,
  onLink,
  t,
}: GuardAgentViewProps) {
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-border bg-card p-3 pl-4"
      data-testid="guard-agent-card"
    >
      <SiemRail className={agentRailClass(agent)} />
      <p className="break-all font-mono text-xs font-medium" title={agent.name}>
        {agent.name}
      </p>
      <CopyableId value={agent.id} label={t("copyAgentId")} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <AgentStatusBadge
          status={agent.status}
          t={t}
          disabled={agent.disabled}
        />
        <span className="text-xs text-muted-foreground">
          {agent.version ?? "—"}
        </span>
        <Badge variant="info">
          {agent.has_host_agent_token ? t("hasHostToken") : t("noHostToken")}
        </Badge>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {t("colLastSeen")}: {formatWhen(agent.last_keep_alive, dateLocale)}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {t("colHelperPoll")}: {formatWhen(agent.last_helper_poll_at, dateLocale)}
      </p>
      {agent.asset_id ? (
        <div className="mt-2">
          <GuardAssetChip agent={agent} t={t} />
        </div>
      ) : null}
      {canAdmin ? (
        <div className="mt-2 flex flex-col gap-2">
          <GuardAssetSelect
            agent={agent}
            assets={assets}
            labeled
            onLink={onLink}
            t={t}
          />
          <HostTokenIssueButton
            agent={agent}
            t={t}
            pending={hostTokenPending}
            onIssue={onIssueHostToken}
          />
          {!agent.disabled ? (
            <DisableAgentButton
              agent={agent}
              t={t}
              pending={disablePending}
              onDisable={onDisable}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
