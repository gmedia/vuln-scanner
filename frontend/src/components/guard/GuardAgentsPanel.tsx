import { Monitor } from "lucide-react";
import type { ScanAsset } from "@/api/assets";
import type { GuardAgent } from "@/api/guard";
import { GuardAgentCard } from "@/components/guard/GuardAgentCard";
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
import { SiemEmptyIsland } from "@/components/siem/SiemEmptyIsland";
import { SiemRail } from "@/components/siem/siemChrome";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";

export type GuardAgentsPanelProps = {
  readonly loading: boolean;
  readonly agents: readonly GuardAgent[];
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

function AgentTableRow({
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
}: {
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
}) {
  return (
    <TableRow data-testid="guard-agent-row" className="relative">
      <TableCell
        className="relative min-w-[14rem] max-w-[min(28rem,40vw)] pl-4"
        title={agent.name}
      >
        <SiemRail className={agentRailClass(agent)} />
        <span className="block truncate font-mono text-xs font-medium">
          {agent.name}
        </span>
        <CopyableId value={agent.id} label={t("copyAgentId")} />
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <AgentStatusBadge
          status={agent.status}
          t={t}
          disabled={agent.disabled}
        />
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        <div>{formatWhen(agent.last_keep_alive, dateLocale)}</div>
        <div className="text-[11px]">
          {t("colHelperPoll")}: {formatWhen(agent.last_helper_poll_at, dateLocale)}
        </div>
      </TableCell>
      <TableCell
        className="max-w-[8rem] truncate text-muted-foreground"
        title={agent.version ?? undefined}
      >
        {agent.version ?? "—"}
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <GuardAssetChip agent={agent} t={t} />
          {canAdmin ? (
            <GuardAssetSelect
              agent={agent}
              assets={assets}
              labeled={false}
              onLink={onLink}
              t={t}
            />
          ) : agent.asset_id ? null : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {canAdmin ? (
            <HostTokenIssueButton
              agent={agent}
              t={t}
              pending={hostTokenPending}
              onIssue={onIssueHostToken}
            />
          ) : null}
          {canAdmin && !agent.disabled ? (
            <DisableAgentButton
              agent={agent}
              t={t}
              pending={disablePending}
              onDisable={onDisable}
            />
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

export function GuardAgentsPanel({
  loading,
  agents,
  canAdmin,
  assets,
  dateLocale,
  hostTokenPending,
  disablePending,
  onIssueHostToken,
  onDisable,
  onLink,
  t,
}: GuardAgentsPanelProps) {
  return (
    <section
      data-testid="guard-agents"
      className="rounded-lg border border-border bg-card"
    >
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold tracking-wide">{t("agents")}</h3>
      </div>
      <div className="p-4">
        {loading ? (
          <TableRowSkeleton rows={4} />
        ) : agents.length === 0 ? (
          <SiemEmptyIsland
            icon={Monitor}
            title={t("noAgents")}
            testId="guard-agents-empty"
          />
        ) : (
          <div>
            <div className="space-y-2 md:hidden">
              {agents.map((agent) => (
                <GuardAgentCard
                  key={agent.id}
                  agent={agent}
                  canAdmin={canAdmin}
                  assets={assets}
                  dateLocale={dateLocale}
                  hostTokenPending={hostTokenPending}
                  disablePending={disablePending}
                  onIssueHostToken={onIssueHostToken}
                  onDisable={onDisable}
                  onLink={onLink}
                  t={t}
                />
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table className="min-w-[40rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[14rem]">{t("colName")}</TableHead>
                    <TableHead className="min-w-[7rem]">{t("colStatus")}</TableHead>
                    <TableHead className="min-w-[11rem]">
                      {t("colLastSeen")}
                    </TableHead>
                    <TableHead className="min-w-[6rem]">{t("colVersion")}</TableHead>
                    <TableHead className="min-w-[12rem]">{t("colAction")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((agent) => (
                    <AgentTableRow
                      key={agent.id}
                      agent={agent}
                      canAdmin={canAdmin}
                      assets={assets}
                      dateLocale={dateLocale}
                      hostTokenPending={hostTokenPending}
                      disablePending={disablePending}
                      onIssueHostToken={onIssueHostToken}
                      onDisable={onDisable}
                      onLink={onLink}
                      t={t}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
