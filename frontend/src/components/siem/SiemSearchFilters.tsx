import type { GuardAgent } from "@/api/guard";
import { Button } from "@/components/ui/Button";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Search } from "lucide-react";

type Translate = (key: string) => string;

export type SiemFilterDraft = {
  readonly since: string;
  readonly until: string;
  readonly minLevel: string;
  readonly agentId: string;
  readonly q: string;
};

export function SiemSearchFilters({
  draft,
  agents,
  minLevelPlaceholder,
  onChange,
  onApply,
  t,
}: {
  readonly draft: SiemFilterDraft;
  readonly agents: readonly GuardAgent[];
  readonly minLevelPlaceholder: string;
  readonly onChange: (next: SiemFilterDraft) => void;
  readonly onApply: () => void;
  readonly t: Translate;
}) {
  const set = (patch: Partial<SiemFilterDraft>) =>
    onChange({ ...draft, ...patch });

  return (
    <div
      data-testid="siem-search-filters"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="siem-since">{t("sinceLabel")}</Label>
        <DateTimePicker
          id="siem-since"
          value={draft.since}
          onChange={(since) => set({ since })}
          placeholder={t("datetimePlaceholder")}
          aria-label={t("since")}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="siem-until">{t("untilLabel")}</Label>
        <DateTimePicker
          id="siem-until"
          value={draft.until}
          onChange={(until) => set({ until })}
          placeholder={t("datetimePlaceholder")}
          aria-label={t("until")}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="siem-level">{t("minLevel")}</Label>
        <Input
          id="siem-level"
          type="number"
          min={0}
          max={15}
          placeholder={minLevelPlaceholder}
          value={draft.minLevel}
          onChange={(e) => set({ minLevel: e.target.value })}
          className="h-10 min-h-10"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="siem-agent">{t("agent")}</Label>
        <Select
          value={draft.agentId || "__all__"}
          onValueChange={(value) =>
            set({ agentId: value === "__all__" ? "" : value })
          }
        >
          <SelectTrigger
            id="siem-agent"
            aria-label={t("agent")}
            className="h-10 min-h-10 [&>span]:line-clamp-none [&>span]:whitespace-nowrap"
          >
            <SelectValue placeholder={t("allAgents")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("allAgents")}</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.wazuh_agent_id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="siem-q">{t("query")}</Label>
        <Input
          id="siem-q"
          value={draft.q}
          maxLength={128}
          onChange={(e) => set({ q: e.target.value })}
          placeholder={t("queryPlaceholder")}
          className="h-10 min-h-10"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="siem-apply">{t("apply")}</Label>
        <Button
          id="siem-apply"
          className="h-10 min-h-10 w-full"
          onClick={onApply}
        >
          <Search className="mr-2 h-4 w-4" />
          {t("apply")}
        </Button>
      </div>
    </div>
  );
}
