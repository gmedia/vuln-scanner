import { Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import type { SiemEvent } from "@/api/siem";
import { formatSiemWhen } from "@/components/siem/formatSiemWhen";

type SiemEventDetailProps = {
  readonly event: SiemEvent;
  readonly t: (key: string) => string;
  readonly canCreate: boolean;
  readonly caseTitle: string;
  readonly onCaseTitleChange: (value: string) => void;
  readonly createPending: boolean;
  readonly onCreateCase: () => void;
};

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
    <div className="space-y-3 text-sm" data-testid="siem-event-detail">
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
      <p>
        <span className="text-muted-foreground">{t("detailLevel")}</span>{" "}
        {event.rule_level}
      </p>
      <p>
        <span className="text-muted-foreground">{t("detailRule")}</span>{" "}
        {event.rule_description}
      </p>
      <p>
        <span className="text-muted-foreground">{t("detailAgent")}</span>{" "}
        {event.agent_name ?? event.agent_wazuh_id ?? "—"}
      </p>
      <p>
        <span className="text-muted-foreground">{t("detailTime")}</span>{" "}
        {formatSiemWhen(event.occurred_at)}
      </p>
      {canCreate && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <Label htmlFor="siem-case-title">
              {t("caseTitle")}
            </Label>
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
      )}
    </div>
  );
}
