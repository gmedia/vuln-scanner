import { Copy } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import type { SiemEvent } from "@/api/siem";
import { formatSiemWhen } from "@/components/siem/formatSiemWhen";
import { LevelChip } from "@/components/siem/siemChrome";

type SiemEventDetailProps = {
  readonly event: SiemEvent;
  readonly t: (key: string) => string;
  readonly canCreate: boolean;
  readonly caseTitle: string;
  readonly onCaseTitleChange: (value: string) => void;
  readonly createPending: boolean;
  readonly onCreateCase: () => void;
};

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

export function SiemEventDetail({
  event,
  t,
  canCreate,
  caseTitle,
  onCaseTitleChange,
  createPending,
  onCreateCase,
}: SiemEventDetailProps) {
  return (
    <div className="space-y-4 text-sm" data-testid="siem-event-detail">
      <Field label={t("inspectorId")}>
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
            {event.external_id}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            data-testid="siem-copy-id"
            onClick={() => {
              void navigator.clipboard.writeText(event.external_id);
            }}
            aria-label={t("copyId")}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </Field>
      <Field label={t("detailLevel")}>
        <LevelChip level={event.rule_level} t={t} />
      </Field>
      <Field label={t("detailRule")}>{event.rule_description}</Field>
      <Field label={t("detailAgent")}>
        <span className="break-all font-mono text-xs">
          {event.agent_name ?? event.agent_wazuh_id ?? "—"}
        </span>
      </Field>
      <Field label={t("detailTime")}>
        <span className="font-mono text-xs tabular-nums">
          {formatSiemWhen(event.occurred_at)}
        </span>
      </Field>
      {canCreate ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <div className="min-w-[12rem] flex-1">
            <Label htmlFor="siem-case-title">{t("caseTitle")}</Label>
            <Input
              id="siem-case-title"
              data-testid="siem-case-title"
              value={caseTitle}
              onChange={(e) => onCaseTitleChange(e.target.value)}
            />
          </div>
          <Button
            disabled={!caseTitle.trim() || createPending}
            onClick={onCreateCase}
          >
            {t("createCase")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
