import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import type { UptimeMonitorFormValues } from "@/components/uptime/uptimeForm";

export function Field({
  id,
  label,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function UptimeMonitorHttpFields({
  values,
  patch,
}: {
  readonly values: UptimeMonitorFormValues;
  readonly patch: (partial: Partial<UptimeMonitorFormValues>) => void;
}) {
  const { t } = useTranslation("uptime");
  return (
    <>
      <Field id="up-expect-status" label={t("expectStatus")}>
        <Input
          id="up-expect-status"
          data-testid="uptime-expect-status"
          className="h-10 min-h-10"
          type="number"
          min={100}
          max={599}
          placeholder="200"
          value={values.expectStatus}
          onChange={(e) => patch({ expectStatus: e.target.value })}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {t("expectStatusHint")}
        </p>
      </Field>
      <Field id="up-method" label={t("httpMethod")}>
        <Select
          value={values.httpMethod}
          onValueChange={(value) => patch({ httpMethod: value })}
        >
          <SelectTrigger
            id="up-method"
            className="h-10 min-h-10"
            aria-label={t("httpMethod")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="HEAD">HEAD</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="PATCH">PATCH</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field id="up-keyword" label={t("keyword")}>
        <Input
          id="up-keyword"
          data-testid="uptime-keyword"
          className="h-10 min-h-10"
          value={values.keyword}
          onChange={(e) => patch({ keyword: e.target.value })}
        />
      </Field>
      <div className="flex items-center gap-2">
        <input
          id="up-invert"
          data-testid="uptime-keyword-invert"
          type="checkbox"
          checked={values.keywordInvert}
          onChange={(e) => patch({ keywordInvert: e.target.checked })}
        />
        <Label htmlFor="up-invert">{t("keywordInvert")}</Label>
      </div>
      <Field id="up-headers" label={t("requestHeaders")}>
        <Input
          id="up-headers"
          className="h-10 min-h-10"
          value={values.requestHeaders}
          onChange={(e) => patch({ requestHeaders: e.target.value })}
          placeholder='{"Accept":"application/json"}'
        />
      </Field>
      {values.httpMethod !== "GET" && values.httpMethod !== "HEAD" ? (
        <Field id="up-body" label={t("requestBody")}>
          <Input
            id="up-body"
            className="h-10 min-h-10"
            value={values.requestBody}
            onChange={(e) => patch({ requestBody: e.target.value })}
          />
        </Field>
      ) : null}
    </>
  );
}
