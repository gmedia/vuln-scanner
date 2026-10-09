import type { SiemEvent } from "@/api/siem";
import { EventPager } from "@/components/siem/EventPager";
import { formatSiemWhen } from "@/components/siem/formatSiemWhen";
import { LevelChip, SiemRail } from "@/components/siem/siemChrome";
import { SiemEventMobileCard } from "@/components/siem/SiemEventMobileCard";
import { siemRuleTitle } from "@/components/siem/siemRuleTitle";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { severityRailClass } from "@/lib/siemSeverity";
import { cn } from "@/lib/utils";

type Translate = (key: string, options?: Record<string, number>) => string;

export type SiemEventStreamProps = {
  readonly events: readonly SiemEvent[];
  readonly allCount: number;
  readonly pageSize: number;
  readonly page: number;
  readonly pageCount: number;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly loading: boolean;
  readonly isXl: boolean;
  readonly selectedKey: string | null;
  readonly onSelect: (id: string) => void;
  readonly canCreate: boolean;
  readonly caseTitle: string;
  readonly onCaseTitleChange: (value: string) => void;
  readonly createPending: boolean;
  readonly onCreateCase: (externalId: string) => void;
  readonly t: Translate;
};

function EventPagers({
  allCount,
  pageSize,
  page,
  pageCount,
  onPrev,
  onNext,
  t,
}: Pick<
  SiemEventStreamProps,
  "allCount" | "pageSize" | "page" | "pageCount" | "onPrev" | "onNext" | "t"
>) {
  if (allCount <= pageSize) return null;
  return (
    <EventPager
      count={allCount}
      page={page}
      pages={pageCount}
      onPrev={onPrev}
      onNext={onNext}
      t={t}
    />
  );
}

function EventTable({
  events,
  selectedKey,
  onSelect,
  t,
}: {
  readonly events: readonly SiemEvent[];
  readonly selectedKey: string | null;
  readonly onSelect: (id: string) => void;
  readonly t: Translate;
}) {
  return (
    <Table className="table-fixed">
      <TableHeader className="sticky top-0 z-[1] bg-card shadow-[0_1px_0_hsl(var(--border))]">
        <TableRow>
          <TableHead className="w-[12rem]">{t("colTime")}</TableHead>
          <TableHead className="w-[8rem]">{t("colLevel")}</TableHead>
          <TableHead>{t("colRule")}</TableHead>
          <TableHead>{t("colAgent")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.length === 0 ? (
          <TableRow data-testid="siem-events-empty">
            <TableCell
              colSpan={4}
              className="py-10 text-center text-muted-foreground"
            >
              {t("eventsEmpty")}
            </TableCell>
          </TableRow>
        ) : (
          events.map((ev) => {
            const selected = selectedKey === ev.external_id;
            const critical = ev.rule_level >= 12;
            return (
              <TableRow
                key={ev.external_id}
                data-testid="siem-event-row"
                className={cn(
                  "relative cursor-pointer",
                  selected && "bg-muted/50",
                  critical && "bg-destructive/[0.04]",
                )}
                onClick={() => onSelect(ev.external_id)}
              >
                <TableCell className="relative whitespace-nowrap pl-4 font-mono text-[11px] tabular-nums">
                  <SiemRail className={severityRailClass(ev.rule_level)} />
                  {formatSiemWhen(ev.occurred_at)}
                </TableCell>
                <TableCell>
                  <LevelChip level={ev.rule_level} t={t} />
                </TableCell>
                <TableCell
                  className="whitespace-normal break-words"
                  title={
                    ev.rule_id
                      ? `${ev.rule_description} · ${ev.rule_id}`
                      : ev.rule_description
                  }
                >
                  {siemRuleTitle(ev)}
                </TableCell>
                <TableCell
                  className="break-all font-mono text-xs"
                  title={ev.agent_name ?? ev.agent_wazuh_id ?? undefined}
                >
                  {ev.agent_name ?? ev.agent_wazuh_id ?? "—"}
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

export function SiemEventStream({
  events,
  allCount,
  pageSize,
  page,
  pageCount,
  onPrev,
  onNext,
  loading,
  isXl,
  selectedKey,
  onSelect,
  canCreate,
  caseTitle,
  onCaseTitleChange,
  createPending,
  onCreateCase,
  t,
}: SiemEventStreamProps) {
  if (loading) {
    return <TableRowSkeleton rows={6} columns={4} />;
  }

  const pagers = (
    <EventPagers
      allCount={allCount}
      pageSize={pageSize}
      page={page}
      pageCount={pageCount}
      onPrev={onPrev}
      onNext={onNext}
      t={t}
    />
  );

  if (!isXl) {
    return (
      <>
        {pagers}
        <div className="space-y-2">
          {events.length === 0 ? (
            <p
              data-testid="siem-events-empty"
              className="py-10 text-center text-muted-foreground"
            >
              {t("eventsEmpty")}
            </p>
          ) : (
            events.map((ev) => (
              <SiemEventMobileCard
                key={ev.external_id}
                ev={ev}
                expanded={selectedKey === ev.external_id}
                onToggle={() =>
                  onSelect(
                    selectedKey === ev.external_id ? "" : ev.external_id,
                  )
                }
                canCreate={canCreate}
                caseTitle={caseTitle}
                onCaseTitleChange={onCaseTitleChange}
                createPending={createPending}
                onCreateCase={onCreateCase}
                t={t}
              />
            ))
          )}
        </div>
        {pagers}
      </>
    );
  }

  return (
    <>
      {pagers}
      <EventTable
        events={events}
        selectedKey={selectedKey}
        onSelect={onSelect}
        t={t}
      />
      {pagers}
    </>
  );
}
