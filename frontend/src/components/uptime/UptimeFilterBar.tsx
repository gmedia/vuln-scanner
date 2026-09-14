import { useTranslation } from "react-i18next";
import type { UptimeCheckType } from "@/api/uptime";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";

export type UptimeStateFilter = "all" | "up" | "down" | "unknown" | "degraded";
export type UptimeTypeFilter = "all" | UptimeCheckType;

export function UptimeFilterBar({
  idPrefix,
  stateFilter,
  onStateFilter,
  typeFilter,
  onTypeFilter,
  search,
  onSearch,
  filtersActive,
  filteredCount,
  totalCount,
  hintClassName,
}: {
  readonly idPrefix: string;
  readonly stateFilter: UptimeStateFilter;
  readonly onStateFilter: (v: UptimeStateFilter) => void;
  readonly typeFilter: UptimeTypeFilter;
  readonly onTypeFilter: (v: UptimeTypeFilter) => void;
  readonly search: string;
  readonly onSearch: (v: string) => void;
  readonly filtersActive: boolean;
  readonly filteredCount: number;
  readonly totalCount: number;
  readonly hintClassName?: string;
}) {
  const { t } = useTranslation("uptime");
  return (
    <>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-status`}>{t("filterStatus")}</Label>
        <Select
          value={stateFilter}
          onValueChange={(value) => onStateFilter(value as UptimeStateFilter)}
        >
          <SelectTrigger
            id={`${idPrefix}-status`}
            aria-label={t("filterStatus")}
            className="h-10 min-h-10"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filterAll")}</SelectItem>
            <SelectItem value="up">{t("stateUp")}</SelectItem>
            <SelectItem value="down">{t("stateDown")}</SelectItem>
            <SelectItem value="unknown">{t("stateUnknown")}</SelectItem>
            <SelectItem value="degraded">{t("stateDegraded")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-type`}>{t("filterProtocol")}</Label>
        <Select
          value={typeFilter}
          onValueChange={(value) => onTypeFilter(value as UptimeTypeFilter)}
        >
          <SelectTrigger
            id={`${idPrefix}-type`}
            aria-label={t("filterProtocol")}
            className="h-10 min-h-10"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filterAll")}</SelectItem>
            <SelectItem value="http">http</SelectItem>
            <SelectItem value="tcp">tcp</SelectItem>
            <SelectItem value="heartbeat">heartbeat</SelectItem>
            <SelectItem value="dns">dns</SelectItem>
            <SelectItem value="ping">ping</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-search`}>{t("filterSearch")}</Label>
        <Input
          id={`${idPrefix}-search`}
          className="h-10 min-h-10"
          placeholder={t("filterSearchPlaceholder")}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <p className={hintClassName ?? "text-xs text-muted-foreground"}>
        {filtersActive
          ? t("filterShowing", { shown: filteredCount, total: totalCount })
          : t("filterHint")}
      </p>
    </>
  );
}
