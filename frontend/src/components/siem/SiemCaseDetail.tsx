import type { SiemCase } from "@/api/siem";
import { formatSiemWhen } from "@/components/siem/formatSiemWhen";
import { CaseStatusBadge } from "@/components/siem/siemChrome";
import { caseStatusLabel } from "@/components/siem/siemCaseStatus";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";

type Translate = (key: string) => string;
const CASE_STATUSES = ["open", "ack", "closed"] as const;

export function SiemCaseDetail({
  activeCase,
  canManage,
  canCreate,
  patchPending,
  onPatch,
  noteBody,
  onNoteBodyChange,
  notePending,
  onAddNote,
  t,
}: {
  readonly activeCase: SiemCase;
  readonly canManage: boolean;
  readonly canCreate: boolean;
  readonly patchPending: boolean;
  readonly onPatch: (id: string, status: "open" | "ack" | "closed") => void;
  readonly noteBody: string;
  readonly onNoteBodyChange: (value: string) => void;
  readonly notePending: boolean;
  readonly onAddNote: () => void;
  readonly t: Translate;
}) {
  return (
    <section
      data-testid="siem-case-detail"
      className="space-y-3 rounded-lg border border-border bg-muted/20 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight">
          {activeCase.title}
        </h3>
        <CaseStatusBadge status={activeCase.status} t={t} />
      </div>
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {CASE_STATUSES.map((st) => (
            <Button
              key={st}
              size="sm"
              variant="outline"
              disabled={patchPending}
              onClick={() => onPatch(activeCase.id, st)}
            >
              {caseStatusLabel(st, t)}
            </Button>
          ))}
        </div>
      ) : null}
      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {t("events")}
        </p>
        <ul className="space-y-1 text-sm">
          {activeCase.events.map((ev) => (
            <li key={ev.id} className="font-mono text-xs tabular-nums">
              {formatSiemWhen(ev.occurred_at)} · L{ev.rule_level} ·{" "}
              {ev.rule_description}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {t("notes")}
        </p>
        <ul className="space-y-1 text-sm">
          {activeCase.notes.map((n) => (
            <li key={n.id}>{n.body}</li>
          ))}
        </ul>
      </div>
      {canCreate ? (
        <div className="space-y-2">
          <Label htmlFor="siem-note">{t("newNote")}</Label>
          <Textarea
            id="siem-note"
            value={noteBody}
            maxLength={8000}
            onChange={(e) => onNoteBodyChange(e.target.value)}
          />
          <Button disabled={!noteBody.trim() || notePending} onClick={onAddNote}>
            {t("addNote")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
