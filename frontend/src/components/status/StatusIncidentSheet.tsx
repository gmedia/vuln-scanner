import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { StatusIncident } from "@/api/statusPage";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const IMPACTS = ["none", "minor", "major", "critical"] as const;
const STATUSES = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
] as const;

function Field({
  id,
  label,
  children,
}: {
  readonly id?: string;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {id ? <Label htmlFor={id}>{label}</Label> : <Label>{label}</Label>}
      {children}
    </div>
  );
}

export function StatusIncidentSheet({
  open,
  editing,
  busy,
  onOpenChange,
  onCreate,
  onSaveEdit,
}: {
  readonly open: boolean;
  readonly editing: StatusIncident | null;
  readonly busy: boolean;
  readonly onOpenChange: (next: boolean) => void;
  readonly onCreate: (payload: {
    title: string;
    impact: string;
    status: string;
    body: string;
  }) => void;
  readonly onSaveEdit: (payload: { title: string; impact: string }) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="overflow-y-auto sm:max-w-lg lg:max-w-xl"
        data-testid="status-incident-sheet"
      >
        {open ? (
          <StatusIncidentForm
            key={editing?.id ?? "create"}
            editing={editing}
            busy={busy}
            onOpenChange={onOpenChange}
            onCreate={onCreate}
            onSaveEdit={onSaveEdit}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function StatusIncidentForm({
  editing,
  busy,
  onOpenChange,
  onCreate,
  onSaveEdit,
}: {
  readonly editing: StatusIncident | null;
  readonly busy: boolean;
  readonly onOpenChange: (next: boolean) => void;
  readonly onCreate: (payload: {
    title: string;
    impact: string;
    status: string;
    body: string;
  }) => void;
  readonly onSaveEdit: (payload: { title: string; impact: string }) => void;
}) {
  const { t } = useTranslation("statusPage");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [impact, setImpact] = useState(editing?.impact ?? "minor");
  const [status, setStatus] = useState(editing?.status ?? "investigating");
  const [body, setBody] = useState("");
  const isEdit = Boolean(editing);
  const titleId = isEdit
    ? `status-incident-title-${editing?.id}`
    : "status-incident-title";
  const saveDisabled =
    !title.trim() || busy || (!isEdit && !body.trim());

  return (
    <>
      <SheetHeader>
        <SheetTitle>{isEdit ? t("editIncident") : t("newIncident")}</SheetTitle>
      </SheetHeader>
      <div
        className="space-y-3 px-4"
        data-testid={isEdit ? undefined : "status-incident-create"}
      >
        <Field id={isEdit ? `inc-title-${editing?.id}` : "sp-inc-title"} label={t("incidentTitle")}>
          <Input
            id={isEdit ? `inc-title-${editing?.id}` : "sp-inc-title"}
            data-testid={titleId}
            className="h-10 min-h-10"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label={t("impact")}>
          <Select value={impact} onValueChange={setImpact}>
            <SelectTrigger className="h-10 min-h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMPACTS.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {isEdit ? null : (
          <>
            <Field label={t("status")}>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-10 min-h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="sp-inc-body" label={t("body")}>
              <Textarea
                id="sp-inc-body"
                data-testid="status-incident-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </Field>
          </>
        )}
      </div>
      <SheetFooter>
        <Button
          type="button"
          data-testid={
            isEdit
              ? `status-incident-save-${editing?.id}`
              : "status-incident-create-save"
          }
          disabled={saveDisabled}
          onClick={() => {
            if (isEdit) {
              onSaveEdit({ title: title.trim(), impact });
              return;
            }
            onCreate({
              title: title.trim(),
              impact,
              status,
              body: body.trim(),
            });
          }}
        >
          {isEdit ? t("saveIncident") : t("save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid={isEdit ? undefined : "status-incident-create-cancel"}
          onClick={() => onOpenChange(false)}
        >
          {t("cancel")}
        </Button>
      </SheetFooter>
    </>
  );
}
