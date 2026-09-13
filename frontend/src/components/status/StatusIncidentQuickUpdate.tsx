import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { addIncidentUpdate } from "@/api/statusPage";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";

const STATUSES = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
] as const;

export function StatusIncidentQuickUpdate({
  incidentId,
  onDone,
}: {
  readonly incidentId: string;
  readonly onDone: () => void;
}) {
  const { t } = useTranslation("statusPage");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("monitoring");
  const mut = useMutation({
    mutationFn: () => addIncidentUpdate(incidentId, { body, status }),
    onSuccess: () => {
      setBody("");
      onDone();
    },
  });
  return (
    <div className="mt-3 space-y-2">
      <Label htmlFor={`inc-upd-${incidentId}`}>{t("body")}</Label>
      <Textarea
        id={`inc-upd-${incidentId}`}
        data-testid={`status-incident-update-body-${incidentId}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-10 min-h-10 w-48">
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
        <Button
          type="button"
          size="sm"
          data-testid={`status-incident-update-save-${incidentId}`}
          disabled={!body}
          onClick={() => mut.mutate()}
        >
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
