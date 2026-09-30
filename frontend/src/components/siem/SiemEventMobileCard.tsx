import { ChevronDown, ChevronUp } from "lucide-react";
import type { SiemEvent } from "@/api/siem";
import { formatSiemWhen } from "@/components/siem/formatSiemWhen";
import { LevelChip, SiemRail } from "@/components/siem/siemChrome";
import { SiemEventDetail } from "@/components/siem/SiemEventDetail";
import { siemRuleTitle } from "@/components/siem/siemRuleTitle";
import { severityRailClass } from "@/lib/siemSeverity";
import { cn } from "@/lib/utils";

type Translate = (key: string) => string;

export function SiemEventMobileCard({
  ev,
  expanded,
  onToggle,
  canCreate,
  caseTitle,
  onCaseTitleChange,
  createPending,
  onCreateCase,
  t,
}: {
  readonly ev: SiemEvent;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly canCreate: boolean;
  readonly caseTitle: string;
  readonly onCaseTitleChange: (value: string) => void;
  readonly createPending: boolean;
  readonly onCreateCase: (externalId: string) => void;
  readonly t: Translate;
}) {
  const critical = ev.rule_level >= 12;
  return (
    <div
      className={cn(
        "relative rounded-lg border border-border bg-card p-3 pl-4",
        expanded && "border-primary/50 bg-muted/20",
        critical && "bg-destructive/[0.04]",
      )}
    >
      <SiemRail className={severityRailClass(ev.rule_level)} />
      <button
        type="button"
        data-testid="siem-event-row"
        className="flex min-h-11 w-full flex-col gap-2 text-left"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <div className="flex items-center justify-between gap-2">
          <LevelChip level={ev.rule_level} t={t} />
          <span className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {formatSiemWhen(ev.occurred_at)}
            </span>
            {expanded ? (
              <ChevronUp
                className="h-4 w-4 text-muted-foreground motion-reduce:transition-none"
                aria-hidden
              />
            ) : (
              <ChevronDown
                className="h-4 w-4 text-muted-foreground motion-reduce:transition-none"
                aria-hidden
              />
            )}
          </span>
        </div>
        <p className="break-words text-sm text-foreground">{siemRuleTitle(ev)}</p>
        <p className="break-all font-mono text-xs text-muted-foreground">
          {ev.agent_name ?? ev.agent_wazuh_id ?? "—"}
        </p>
      </button>
      {expanded ? (
        <div className="mt-3 border-t border-border pt-3 motion-reduce:transition-none motion-safe:animate-in motion-safe:fade-in-0">
          <SiemEventDetail
            event={ev}
            t={t}
            canCreate={canCreate}
            caseTitle={caseTitle}
            onCaseTitleChange={onCaseTitleChange}
            createPending={createPending}
            onCreateCase={() => onCreateCase(ev.external_id)}
          />
        </div>
      ) : null}
    </div>
  );
}
