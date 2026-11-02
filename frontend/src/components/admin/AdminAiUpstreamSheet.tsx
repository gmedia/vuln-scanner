import { useState } from "react";
import { Trash2 } from "lucide-react";
import { isAxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  createAiModelUpstream,
  deleteAiModelUpstream,
  updateAiModelUpstream,
  type AiModelAdmin,
  type AiModelUpstreamAdmin,
  type AiProviderAdmin,
} from "@/api/admin";
import { parsePriceInput } from "@/components/admin/aiFormat";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/Button";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
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
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/** 1 primary + 3 fallbacks = 4 candidates. The API enforces the same ceiling. */
const MAX_FALLBACKS = 3;
const NEW_ROW_ID = "__new__";

interface Draft {
  readonly id: string;
  readonly rank: number | null;
  provider_id: string;
  upstream_id: string;
  max_tokens_cap: string;
  hpp_in: string;
  hpp_out: string;
  enabled: boolean;
}

function numberDraft(value: number | null): string {
  return value == null ? "" : String(value);
}

function toDraft(row: AiModelUpstreamAdmin): Draft {
  return {
    id: row.id,
    rank: row.rank,
    provider_id: row.provider_id,
    upstream_id: row.upstream_id,
    max_tokens_cap: numberDraft(row.max_tokens_cap),
    hpp_in: numberDraft(row.hpp_usd_per_1m_in),
    hpp_out: numberDraft(row.hpp_usd_per_1m_out),
    enabled: row.enabled,
  };
}

function draftsFrom(model: AiModelAdmin | null): Draft[] {
  const rows = [...(model?.upstreams ?? [])].sort((a, b) => a.rank - b.rank);
  return rows.map(toDraft);
}

function emptyDraft(): Draft {
  return {
    id: NEW_ROW_ID,
    rank: null,
    provider_id: "",
    upstream_id: "",
    max_tokens_cap: "",
    hpp_in: "",
    hpp_out: "",
    enabled: true,
  };
}

/** Token caps are positive integers; empty clears the override. */
function parseCapInput(raw: string): number | null {
  const parsed = parsePriceInput(raw);
  if (parsed == null) return null;
  const cap = Math.trunc(parsed);
  return cap >= 1 ? cap : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorDetail(error: unknown): string {
  if (!isAxiosError(error)) return "";
  const data = error.response?.data;
  if (!isRecord(data)) return "";
  const detail = data.detail;
  return typeof detail === "string" ? detail.toLowerCase() : "";
}

/** Maps the API rejection to a translation key — never echoes the server string. */
function upstreamErrorKey(error: unknown): string {
  if (!isAxiosError(error)) return "aiFallbackSaveFail";
  const status = error.response?.status;
  const detail = errorDetail(error);
  if (status === 409) {
    return detail.includes("primary")
      ? "aiFallbackErrPrimary"
      : "aiFallbackErrDuplicate";
  }
  if (status === 422) {
    if (
      detail.includes("limit") ||
      detail.includes("candidate") ||
      detail.includes("max")
    ) {
      return "aiFallbackErrLimit";
    }
    return "aiFallbackErrProvider";
  }
  return "aiFallbackSaveFail";
}

function providerChoices(
  providers: readonly AiProviderAdmin[],
  selectedId: string,
): AiProviderAdmin[] {
  const usable = providers.filter((p) => p.enabled && p.status !== "disabled");
  const selected = providers.find((p) => p.id === selectedId);
  if (selected && !usable.some((p) => p.id === selected.id)) {
    return [...usable, selected];
  }
  return usable;
}

function FallbackRow({
  index,
  row,
  providers,
  inheritedCap,
  pending,
  onChange,
  onSave,
  onDelete,
}: {
  readonly index: number;
  readonly row: Draft;
  readonly providers: readonly AiProviderAdmin[];
  readonly inheritedCap: number | null;
  readonly pending: boolean;
  readonly onChange: (patch: Partial<Draft>) => void;
  readonly onSave: () => void;
  readonly onDelete: () => void;
}) {
  const { t } = useTranslation("admin");
  const fieldId = (name: string) => `ai-upstream-${name}-${row.id}`;
  const choices = providerChoices(providers, row.provider_id);
  const hppEmpty = row.hpp_in.trim() === "" || row.hpp_out.trim() === "";
  const canSave =
    !pending && row.provider_id !== "" && row.upstream_id.trim() !== "";

  return (
    <div
      className="space-y-3 rounded-lg border border-border bg-card p-3"
      data-testid={`ai-upstream-row-${row.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs font-medium tabular-nums text-muted-foreground">
          #{index + 2}
        </p>
        <div className="flex items-center gap-2">
          <div className="flex min-h-11 items-center gap-2 md:min-h-10">
            <Checkbox
              id={fieldId("enabled")}
              checked={row.enabled}
              onCheckedChange={(checked) =>
                onChange({ enabled: checked === true })
              }
            />
            <Label
              htmlFor={fieldId("enabled")}
              className="flex min-h-11 cursor-pointer items-center md:min-h-10"
            >
              {t("aiFallbackEnabled")}
            </Label>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 w-11 min-h-11 min-w-11 p-0 md:h-10 md:w-10 md:min-h-10 md:min-w-10"
            aria-label={t("aiFallbackDelete")}
            data-testid={`ai-upstream-delete-${row.id}`}
            onClick={onDelete}
            disabled={pending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={fieldId("provider")}>{t("aiProviderId")}</Label>
          <Select
            value={row.provider_id || undefined}
            onValueChange={(value) => onChange({ provider_id: value })}
          >
            <SelectTrigger
              id={fieldId("provider")}
              className="h-10 min-h-10"
            >
              <SelectValue placeholder={t("aiSelectProvider")} />
            </SelectTrigger>
            <SelectContent>
              {choices.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={fieldId("upstream")}>{t("aiUpstreamId")}</Label>
          <Input
            id={fieldId("upstream")}
            className="h-10 min-h-10 font-mono"
            value={row.upstream_id}
            onChange={(e) => onChange({ upstream_id: e.target.value })}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={fieldId("cap")}>{t("aiFallbackMaxTokens")}</Label>
          <Input
            id={fieldId("cap")}
            className="h-10 min-h-10 tabular-nums"
            inputMode="numeric"
            placeholder={inheritedCap == null ? "" : String(inheritedCap)}
            value={row.max_tokens_cap}
            onChange={(e) => onChange({ max_tokens_cap: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={fieldId("hpp-in")}>{t("aiHppInUsd")}</Label>
            <Input
              id={fieldId("hpp-in")}
              className="h-10 min-h-10 tabular-nums"
              inputMode="decimal"
              placeholder={t("aiFallbackInherit")}
              value={row.hpp_in}
              onChange={(e) => onChange({ hpp_in: e.target.value })}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={fieldId("hpp-out")}>{t("aiHppOutUsd")}</Label>
            <Input
              id={fieldId("hpp-out")}
              className="h-10 min-h-10 tabular-nums"
              inputMode="decimal"
              placeholder={t("aiFallbackInherit")}
              value={row.hpp_out}
              onChange={(e) => onChange({ hpp_out: e.target.value })}
            />
          </div>
        </div>
      </div>
      {hppEmpty ? (
        <p className="text-xs text-muted-foreground">
          {t("aiFallbackHppHint")}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          className="h-10 min-h-10"
          data-testid={`ai-upstream-save-${row.id}`}
          onClick={onSave}
          disabled={!canSave}
        >
          {t("aiFallbackSave")}
        </Button>
      </div>
    </div>
  );
}

function UpstreamSheetBody({
  model,
  providers,
  onChanged,
}: {
  readonly model: AiModelAdmin;
  readonly providers: readonly AiProviderAdmin[];
  readonly onChanged: (model: AiModelAdmin) => void;
}) {
  const { t } = useTranslation("admin");
  const [rows, setRows] = useState<Draft[]>(() => draftsFrom(model));
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Draft | null>(null);

  const primaryProvider = providers.find((p) => p.id === model.provider_id);
  const primaryName = primaryProvider?.name ?? model.provider_id;
  const atCap = rows.length >= MAX_FALLBACKS;
  const nextRank =
    rows.reduce((max, row) => Math.max(max, row.rank ?? 0), 0) + 1;

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const applyUpdated = (updated: AiModelAdmin) => {
    setRows(draftsFrom(updated));
    onChanged(updated);
  };

  const saveRow = async (row: Draft) => {
    setPendingId(row.id);
    try {
      const body = {
        provider_id: row.provider_id,
        upstream_id: row.upstream_id.trim(),
        hpp_usd_per_1m_in: parsePriceInput(row.hpp_in),
        hpp_usd_per_1m_out: parsePriceInput(row.hpp_out),
        max_tokens_cap: parseCapInput(row.max_tokens_cap),
      };
      const updated =
        row.id === NEW_ROW_ID
          ? await createAiModelUpstream(model.id, { ...body, rank: nextRank })
          : await updateAiModelUpstream(model.id, row.id, {
              ...body,
              enabled: row.enabled,
            });
      applyUpdated(updated);
      toast.success(t("aiFallbackSavedOk"));
    } catch (error) {
      toast.error(t(upstreamErrorKey(error)));
    } finally {
      setPendingId(null);
    }
  };

  const removeRow = async (row: Draft) => {
    if (row.id === NEW_ROW_ID) {
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      return;
    }
    setPendingId(row.id);
    try {
      const updated = await deleteAiModelUpstream(model.id, row.id);
      applyUpdated(updated);
      toast.success(t("aiFallbackDeletedOk"));
    } catch (error) {
      toast.error(t(upstreamErrorKey(error)));
    } finally {
      setPendingId(null);
    }
  };

  const requestDelete = (row: Draft) => {
    if (row.id === NEW_ROW_ID) {
      void removeRow(row);
      return;
    }
    setDeleteTarget(row);
  };

  const addDraft = () => {
    if (atCap) return;
    setRows((prev) =>
      prev.some((row) => row.id === NEW_ROW_ID) ? prev : [...prev, emptyDraft()],
    );
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle>{t("aiFallbackTitle")}</SheetTitle>
        <SheetDescription className="break-all font-mono">
          {model.public_id}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-4">
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            {t("aiFallbackPrimary")}
          </p>
          <p className="mt-1 break-all text-sm font-medium text-foreground">
            {primaryName}
          </p>
          <p className="break-all font-mono text-xs text-muted-foreground">
            {model.upstream_id}
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("aiFallbackEmpty")}
          </p>
        ) : null}
        <div className="space-y-3">
          {rows.map((row, index) => (
            <FallbackRow
              key={row.id}
              index={index}
              row={row}
              providers={providers}
              inheritedCap={model.max_tokens_cap}
              pending={pendingId === row.id}
              onChange={(patch) => updateDraft(row.id, patch)}
              onSave={() => void saveRow(row)}
              onDelete={() => requestDelete(row)}
            />
          ))}
        </div>
        <div className="space-y-2 border-t border-border pt-3">
          <Button
            type="button"
            variant="outline"
            className="h-10 min-h-10 w-full sm:w-auto"
            data-testid="ai-upstream-add"
            onClick={addDraft}
            disabled={atCap}
          >
            {t("aiFallbackAdd")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t("aiFallbackLimit")}
          </p>
        </div>
      </div>
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("aiFallbackDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("aiFallbackDeleteBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("aiCancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              data-testid="ai-upstream-delete-confirm"
              onClick={() => {
                const target = deleteTarget;
                setDeleteTarget(null);
                if (target) void removeRow(target);
              }}
            >
              {t("aiFallbackDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function AdminAiUpstreamSheet({
  model,
  providers,
  open,
  onOpenChange,
  onChanged,
}: {
  readonly model: AiModelAdmin | null;
  readonly providers: readonly AiProviderAdmin[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: (model: AiModelAdmin) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
        data-testid="admin-ai-upstream-sheet"
      >
        {model ? (
          <UpstreamSheetBody
            key={model.id}
            model={model}
            providers={providers}
            onChanged={onChanged}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
