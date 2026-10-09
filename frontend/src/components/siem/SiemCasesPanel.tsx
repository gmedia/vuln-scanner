import type { SiemCase } from "@/api/siem";
import { SiemCaseDetail } from "@/components/siem/SiemCaseDetail";
import { formatSiemWhen } from "@/components/siem/formatSiemWhen";
import { CaseStatusBadge, SiemRail } from "@/components/siem/siemChrome";
import { caseStatusRailClass } from "@/components/siem/siemCaseStatus";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { cn } from "@/lib/utils";

type Translate = (key: string, options?: Record<string, number>) => string;

export type SiemCasesPanelProps = {
  readonly cases: readonly SiemCase[];
  readonly loading: boolean;
  readonly activeCase: SiemCase | undefined;
  readonly onSelect: (id: string) => void;
  readonly canManage: boolean;
  readonly canCreate: boolean;
  readonly patchPending: boolean;
  readonly onPatch: (id: string, status: "open" | "ack" | "closed") => void;
  readonly noteBody: string;
  readonly onNoteBodyChange: (value: string) => void;
  readonly notePending: boolean;
  readonly onAddNote: () => void;
  readonly t: Translate;
};

function CasesList({
  cases,
  activeCaseId,
  onSelect,
  t,
}: {
  readonly cases: readonly SiemCase[];
  readonly activeCaseId: string | undefined;
  readonly onSelect: (id: string) => void;
  readonly t: Translate;
}) {
  return (
    <>
      <div className="space-y-2 md:hidden">
        {cases.map((c) => (
          <Button
            key={c.id}
            type="button"
            variant="outline"
            className="relative h-auto w-full justify-between px-3 py-2 pl-4 text-left text-sm font-normal"
            onClick={() => onSelect(c.id)}
          >
            <SiemRail className={caseStatusRailClass(c.status)} />
            <span>{c.title}</span>
            <CaseStatusBadge status={c.status} t={t} />
          </Button>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colCaseTitle")}</TableHead>
              <TableHead>{t("colCaseStatus")}</TableHead>
              <TableHead>{t("colSeverity")}</TableHead>
              <TableHead>{t("colUpdated")}</TableHead>
              <TableHead className="text-right">{t("colEventCount")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.map((c) => (
              <TableRow
                key={c.id}
                className={cn(
                  "relative cursor-pointer",
                  activeCaseId === c.id && "bg-muted/50",
                )}
                onClick={() => onSelect(c.id)}
              >
                <TableCell className="relative pl-4 font-medium">
                  <SiemRail className={caseStatusRailClass(c.status)} />
                  {c.title}
                </TableCell>
                <TableCell>
                  <CaseStatusBadge status={c.status} t={t} />
                </TableCell>
                <TableCell className="font-mono text-xs tabular-nums">
                  {c.severity ?? "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground">
                  {formatSiemWhen(c.updated_at)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {c.events.length}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export function SiemCasesPanel({
  cases,
  loading,
  activeCase,
  onSelect,
  canManage,
  canCreate,
  patchPending,
  onPatch,
  noteBody,
  onNoteBodyChange,
  notePending,
  onAddNote,
  t,
}: SiemCasesPanelProps) {
  let listBody;
  if (loading) {
    listBody = <TableRowSkeleton rows={4} columns={5} />;
  } else if (cases.length === 0) {
    listBody = (
      <p className="text-sm text-muted-foreground">{t("casesEmpty")}</p>
    );
  } else {
    listBody = (
      <CasesList
        cases={cases}
        activeCaseId={activeCase?.id}
        onSelect={onSelect}
        t={t}
      />
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <p className="text-xs text-muted-foreground">{t("casesHint")}</p>
        {listBody}
        {activeCase ? (
          <SiemCaseDetail
            activeCase={activeCase}
            canManage={canManage}
            canCreate={canCreate}
            patchPending={patchPending}
            onPatch={onPatch}
            noteBody={noteBody}
            onNoteBodyChange={onNoteBodyChange}
            notePending={notePending}
            onAddNote={onAddNote}
            t={t}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
