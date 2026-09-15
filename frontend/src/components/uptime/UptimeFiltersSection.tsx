import { useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";
import {
  UptimeFilterBar,
  type UptimeStateFilter,
  type UptimeTypeFilter,
} from "@/components/uptime/UptimeFilterBar";

export function UptimeFiltersSection({
  stateFilter,
  onStateFilter,
  typeFilter,
  onTypeFilter,
  search,
  onSearch,
  filtersActive,
  filteredCount,
  totalCount,
}: {
  readonly stateFilter: UptimeStateFilter;
  readonly onStateFilter: (v: UptimeStateFilter) => void;
  readonly typeFilter: UptimeTypeFilter;
  readonly onTypeFilter: (v: UptimeTypeFilter) => void;
  readonly search: string;
  readonly onSearch: (v: string) => void;
  readonly filtersActive: boolean;
  readonly filteredCount: number;
  readonly totalCount: number;
}) {
  const { t } = useTranslation("uptime");
  const bar = {
    stateFilter,
    onStateFilter,
    typeFilter,
    onTypeFilter,
    search,
    onSearch,
    filtersActive,
    filteredCount,
    totalCount,
  };
  return (
    <>
      <div className="sm:hidden">
        <Accordion type="single" collapsible>
          <AccordionItem
            value="filters"
            className="rounded-md border border-border bg-card px-4 last:border-b"
          >
            <AccordionTrigger data-testid="uptime-filters-toggle">
              {t("filtersToggle")}
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 gap-3">
                <UptimeFilterBar idPrefix="uptime-filter-m" {...bar} />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
      <div
        data-testid="uptime-filters"
        className="hidden grid-cols-1 gap-3 rounded-md border border-border bg-card p-4 sm:grid sm:grid-cols-2 lg:grid-cols-3"
      >
        <UptimeFilterBar
          idPrefix="uptime-filter"
          {...bar}
          hintClassName="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3"
        />
      </div>
    </>
  );
}
