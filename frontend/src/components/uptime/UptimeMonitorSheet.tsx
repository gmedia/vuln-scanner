import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { UptimeCheckType, UptimeCreatePayload, UptimeMonitor } from "@/api/uptime";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";
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
import {
  Field,
  UptimeMonitorHttpFields,
} from "@/components/uptime/UptimeMonitorHttpFields";
import {
  UPTIME_CHECK_TYPES,
  asUptimeCheckType,
  formFromMonitor,
  parseUptimeFormPayload,
  type UptimeMonitorFormValues,
} from "@/components/uptime/uptimeForm";

function targetPlaceholder(checkType: UptimeCheckType): string {
  if (checkType === "http") return "https://example.com";
  if (checkType === "tcp") return "example.com:443";
  return "example.com";
}

export function UptimeMonitorSheet({
  open,
  editing,
  busy,
  heartbeatUrl,
  onOpenChange,
  onSave,
}: {
  readonly open: boolean;
  readonly editing: UptimeMonitor | null;
  readonly busy: boolean;
  readonly heartbeatUrl: string | null;
  readonly onOpenChange: (next: boolean) => void;
  readonly onSave: (payload: UptimeCreatePayload) => boolean | void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="overflow-y-auto sm:max-w-lg lg:max-w-xl"
        data-testid="uptime-sheet"
      >
        {open ? (
          <UptimeMonitorForm
            key={editing?.id ?? "create"}
            editing={editing}
            busy={busy}
            heartbeatUrl={heartbeatUrl}
            onOpenChange={onOpenChange}
            onSave={onSave}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function UptimeMonitorForm({
  editing,
  busy,
  heartbeatUrl,
  onOpenChange,
  onSave,
}: {
  readonly editing: UptimeMonitor | null;
  readonly busy: boolean;
  readonly heartbeatUrl: string | null;
  readonly onOpenChange: (next: boolean) => void;
  readonly onSave: (payload: UptimeCreatePayload) => boolean | void;
}) {
  const { t } = useTranslation("uptime");
  const [values, setValues] = useState<UptimeMonitorFormValues>(() =>
    formFromMonitor(editing),
  );

  const patch = (partial: Partial<UptimeMonitorFormValues>) =>
    setValues((prev) => ({ ...prev, ...partial }));

  const advancedDefault =
    editing &&
    (Number(values.timeoutSeconds) !== 10 || Boolean(values.expectStatus.trim()))
      ? "advanced"
      : undefined;

  const saveDisabled =
    !values.name.trim() ||
    (values.checkType !== "heartbeat" && !values.target.trim()) ||
    busy;

  return (
    <>
        <SheetHeader>
          <SheetTitle>{editing ? t("editTitle") : t("add")}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 px-4">
          <Field id="up-name" label={t("name")}>
            <Input
              id="up-name"
              data-testid="uptime-name"
              value={values.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <Field id="up-type" label={t("type")}>
            <Select
              value={values.checkType}
              disabled={Boolean(editing)}
              onValueChange={(value) =>
                patch({ checkType: asUptimeCheckType(value) })
              }
            >
              <SelectTrigger
                id="up-type"
                data-testid="uptime-type"
                aria-label={t("type")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UPTIME_CHECK_TYPES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {values.checkType !== "heartbeat" ? (
            <Field id="up-target" label={t("target")}>
              <Input
                id="up-target"
                data-testid="uptime-target"
                value={values.target}
                disabled={Boolean(editing)}
                onChange={(e) => patch({ target: e.target.value })}
                placeholder={targetPlaceholder(values.checkType)}
              />
            </Field>
          ) : (
            <p className="text-sm text-muted-foreground">{t("heartbeatHint")}</p>
          )}
          {values.checkType === "ping" ? (
            <p className="text-sm text-muted-foreground">{t("pingDisabled")}</p>
          ) : null}
          <Field id="up-interval" label={t("interval")}>
            <Input
              id="up-interval"
              data-testid="uptime-interval"
              type="number"
              min={60}
              max={900}
              value={values.interval}
              onChange={(e) => patch({ interval: e.target.value })}
            />
          </Field>
          <Accordion
            type="single"
            collapsible
            key={editing?.id ?? "create"}
            defaultValue={advancedDefault}
            className="rounded-md border border-border px-3"
            data-testid="uptime-advanced"
          >
            <AccordionItem value="advanced" className="border-b-0">
              <AccordionTrigger>{t("advanced")}</AccordionTrigger>
              <AccordionContent className="space-y-3">
                {values.checkType !== "heartbeat" ? (
                  <Field id="up-timeout" label={t("timeout")}>
                    <Input
                      id="up-timeout"
                      data-testid="uptime-timeout"
                      className="h-10 min-h-10"
                      type="number"
                      min={1}
                      max={30}
                      value={values.timeoutSeconds}
                      onChange={(e) => patch({ timeoutSeconds: e.target.value })}
                    />
                  </Field>
                ) : null}
                {values.checkType === "http" ? (
                  <UptimeMonitorHttpFields values={values} patch={patch} />
                ) : null}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          {values.checkType === "dns" ? (
            <>
              <Field id="up-dns" label={t("dnsRecord")}>
                <Select
                  value={values.dnsRecord}
                  onValueChange={(value) => patch({ dnsRecord: value })}
                >
                  <SelectTrigger id="up-dns" aria-label={t("dnsRecord")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A</SelectItem>
                    <SelectItem value="AAAA">AAAA</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field id="up-expect" label={t("expectedValues")}>
                <Input
                  id="up-expect"
                  value={values.expectedValues}
                  onChange={(e) => patch({ expectedValues: e.target.value })}
                />
              </Field>
            </>
          ) : null}
          <Field id="up-notify" label={t("notify")}>
            <Input
              id="up-notify"
              data-testid="uptime-notify"
              type="email"
              value={values.notify}
              onChange={(e) => patch({ notify: e.target.value })}
            />
          </Field>
          {heartbeatUrl ? (
            <p
              className="break-all font-mono text-xs"
              data-testid="uptime-heartbeat-url"
            >
              {t("heartbeatUrl")}: {heartbeatUrl}
            </p>
          ) : null}
        </div>
        <SheetFooter>
          <Button
            data-testid="uptime-save"
            disabled={saveDisabled}
            onClick={() => {
              const parsed = parseUptimeFormPayload(values);
              if (!parsed.ok) {
                toast.error("Invalid headers JSON");
                return;
              }
              onSave(parsed.payload);
            }}
          >
            {t("save")}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
        </SheetFooter>
    </>
  );
}


