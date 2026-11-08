import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Loader2,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Power,
  PowerOff,
  TriangleAlert,
} from "lucide-react";

import PageHeader from "@/components/layout/PageHeader";
import {
  AdminShell,
  AdminShellBody,
  AdminShellHead,
} from "@/components/admin/AdminShell";
import { formatAiTime, formatIdr } from "@/components/admin/aiFormat";
import { EmptyState } from "@/components/patterns/EmptyState";
import { FieldError, FormAlert } from "@/components/patterns/FormFeedback";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { useApiFormErrors } from "@/hooks/useApiFormErrors";
import { apiErrorMessage } from "@/api/apiErrors";
import {
  createAdminTopupPack,
  listAdminTopupPacks,
  updateAdminTopupPack,
  type AdminTopupPack,
  type CreateAdminTopupPackInput,
  type UpdateAdminTopupPackInput,
} from "@/api/adminAiTopupPacks";

const PACKS_QUERY_KEY = ["admin-ai-topup-packs"] as const;

/** String-backed form state so an empty input stays empty while typing. */
type PackFormState = {
  code: string;
  label: string;
  amount_idr: string;
  bonus_idr: string;
  sort_order: string;
};

type PackFormField = keyof PackFormState;

const EMPTY_FORM: PackFormState = {
  code: "",
  label: "",
  amount_idr: "",
  bonus_idr: "0",
  sort_order: "0",
};

function formFromPack(item: AdminTopupPack): PackFormState {
  return {
    code: item.code,
    label: item.label,
    amount_idr: String(item.amount_idr),
    bonus_idr: String(item.bonus_idr),
    sort_order: String(item.sort_order),
  };
}

/** Whole-number parser; returns null for anything that is not an integer literal. */
function parseInteger(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const value = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(value) ? value : null;
}

function validatePackForm(
  form: PackFormState,
  t: (key: string) => string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.code.trim()) errors.code = t("aiTopupPacksCodeRequired");
  if (!form.label.trim()) errors.label = t("aiTopupPacksLabelRequired");

  const amount = parseInteger(form.amount_idr);
  if (amount === null || amount <= 0) {
    errors.amount_idr = t("aiTopupPacksAmountInvalid");
  }

  const bonusRaw = form.bonus_idr.trim();
  const bonus = bonusRaw === "" ? 0 : parseInteger(bonusRaw);
  if (bonus === null || bonus < 0) {
    errors.bonus_idr = t("aiTopupPacksBonusInvalid");
  }

  const sortRaw = form.sort_order.trim();
  const sort = sortRaw === "" ? 0 : parseInteger(sortRaw);
  if (sort === null) {
    errors.sort_order = t("aiTopupPacksSortInvalid");
  }

  return errors;
}

function formToBody(form: PackFormState): CreateAdminTopupPackInput {
  const bonusRaw = form.bonus_idr.trim();
  const sortRaw = form.sort_order.trim();
  return {
    code: form.code.trim(),
    label: form.label.trim(),
    amount_idr: Number.parseInt(form.amount_idr.trim(), 10),
    bonus_idr: bonusRaw === "" ? 0 : Number.parseInt(bonusRaw, 10),
    sort_order: sortRaw === "" ? 0 : Number.parseInt(sortRaw, 10),
  };
}

function PackRowActions({
  item,
  desktop,
  onEdit,
  onToggle,
}: {
  item: AdminTopupPack;
  desktop: boolean;
  onEdit: (item: AdminTopupPack) => void;
  onToggle: (item: AdminTopupPack) => void;
}) {
  const { t } = useTranslation("admin");
  const surface = desktop ? "" : "-mobile";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={desktop ? "h-9 w-9 p-0" : "h-11 w-11 min-h-11 min-w-11 p-0"}
          data-testid={`pack-actions${surface}-${item.id}`}
          aria-label={t("actionsMenu")}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          data-testid={`pack-edit${surface}-${item.id}`}
          onSelect={() => onEdit(item)}
        >
          <Pencil className="mr-2 h-4 w-4" />
          {t("aiTopupPacksEdit")}
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid={`pack-toggle${surface}-${item.id}`}
          onSelect={() => onToggle(item)}
        >
          {item.active ? (
            <PowerOff className="mr-2 h-4 w-4" />
          ) : (
            <Power className="mr-2 h-4 w-4" />
          )}
          {item.active ? t("aiTopupPacksDeactivate") : t("aiTopupPacksActivate")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AdminAiTopupPacks() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.language === "en" ? "en-US" : "id-ID";
  const qc = useQueryClient();

  const [form, setForm] = useState<PackFormState | null>(null);
  const [editing, setEditing] = useState<AdminTopupPack | null>(null);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const { formError, fieldErrors, apply, clearField, clear } =
    useApiFormErrors();

  const listQ = useQuery({
    queryKey: PACKS_QUERY_KEY,
    queryFn: () => listAdminTopupPacks(),
  });

  const createMut = useMutation({
    mutationFn: (body: CreateAdminTopupPackInput) =>
      createAdminTopupPack(body),
    onSuccess: () => {
      toast.success(t("aiTopupPacksCreated"));
      closeForm();
      void qc.invalidateQueries({ queryKey: PACKS_QUERY_KEY });
    },
    onError: (err) => apply(err, t("aiTopupPacksCreateFail")),
  });

  const updateMut = useMutation({
    mutationFn: (input: {
      id: string;
      body: UpdateAdminTopupPackInput;
    }) => updateAdminTopupPack(input.id, input.body),
    onSuccess: () => {
      toast.success(t("aiTopupPacksSaved"));
      closeForm();
      void qc.invalidateQueries({ queryKey: PACKS_QUERY_KEY });
    },
    onError: (err) => apply(err, t("aiTopupPacksSaveFail")),
  });

  const toggleMut = useMutation({
    mutationFn: (item: AdminTopupPack) =>
      updateAdminTopupPack(item.id, { active: !item.active }),
    onSuccess: (_pack, item) => {
      toast.success(
        item.active
          ? t("aiTopupPacksDeactivatedToast")
          : t("aiTopupPacksActivatedToast"),
      );
      void qc.invalidateQueries({ queryKey: PACKS_QUERY_KEY });
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, t("aiTopupPacksToggleFail"))),
  });

  function closeForm() {
    setForm(null);
    setEditing(null);
    setLocalErrors({});
    clear();
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setLocalErrors({});
    clear();
  }

  function openEdit(item: AdminTopupPack) {
    setEditing(item);
    setForm(formFromPack(item));
    setLocalErrors({});
    clear();
  }

  function patchForm(next: Partial<PackFormState>) {
    setForm((current) => (current ? { ...current, ...next } : current));
  }

  function clearFieldError(field: PackFormField) {
    setLocalErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    clearField(field);
  }

  function fieldError(field: PackFormField): string | undefined {
    return localErrors[field] ?? fieldErrors[field];
  }

  function submitForm() {
    if (!form) return;
    const errors = validatePackForm(form, t);
    setLocalErrors(errors);
    if (Object.keys(errors).length > 0) return;
    const body = formToBody(form);
    if (editing) {
      updateMut.mutate({ id: editing.id, body });
    } else {
      createMut.mutate(body);
    }
  }

  const items = listQ.data?.items ?? [];
  const total = listQ.data?.total ?? items.length;
  const zeroActive =
    items.length > 0 && items.every((item) => !item.active);
  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="w-full space-y-6" data-testid="admin-ai-packs-page">
      <PageHeader
        leading={<Package className="h-6 w-6 shrink-0 text-primary-text" />}
        title={t("aiTopupPacksTitle")}
        description={t("aiTopupPacksSubtitle")}
        actions={
          <Button
            type="button"
            onClick={openCreate}
            data-testid="admin-ai-packs-create"
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            {t("aiTopupPacksAdd")}
          </Button>
        }
      />

      {zeroActive ? (
        <AdminShell tone="warn" testid="admin-ai-packs-zero-active">
          <AdminShellHead
            icon={TriangleAlert}
            title={t("aiTopupPacksZeroActiveTitle")}
            hint={t("aiTopupPacksZeroActiveBody")}
          />
        </AdminShell>
      ) : null}

      <AdminShell tone="primary" testid="admin-ai-packs-list">
        <AdminShellHead
          icon={Package}
          title={t("aiTopupPacksListTitle")}
          hint={t("aiTopupPacksSubtitle")}
          aside={
            <Badge variant="info" className="font-mono text-[10px]">
              {total}
            </Badge>
          }
        />
        <AdminShellBody className="space-y-3">
          {listQ.isLoading ? (
            <TableRowSkeleton rows={5} columns={8} />
          ) : listQ.isError ? (
            <EmptyState
              icon={Package}
              title={t("aiTopupPacksLoadError")}
              testId="admin-ai-packs-error"
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  data-testid="admin-ai-packs-retry"
                  onClick={() => void listQ.refetch()}
                >
                  {t("aiTopupPacksRetry")}
                </Button>
              }
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Package}
              title={t("aiTopupPacksEmptyTitle")}
              hint={t("aiTopupPacksEmptyHint")}
              testId="admin-ai-packs-empty"
            />
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-md border border-border md:block">
                <Table data-testid="admin-ai-packs-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("aiTopupPacksColCode")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("aiTopupPacksColLabel")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("aiTopupPacksColAmount")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("aiTopupPacksColBonus")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("aiTopupPacksColActive")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("aiTopupPacksColSort")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("aiTopupPacksColUpdated")}
                      </TableHead>
                      <TableHead className="text-right text-[10px] uppercase tracking-wider">
                        {t("colActions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow
                        key={item.id}
                        data-testid={`pack-row-${item.id}`}
                      >
                        <TableCell className="font-mono text-xs text-foreground">
                          {item.code}
                        </TableCell>
                        <TableCell className="text-sm text-foreground">
                          {item.label}
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums text-foreground">
                          {formatIdr(item.amount_idr)}
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums text-foreground">
                          {formatIdr(item.bonus_idr)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={item.active ? "success" : "default"}
                            className="text-[10px] uppercase"
                            data-testid={`pack-status-${item.id}`}
                          >
                            {item.active
                              ? t("aiTopupPacksActive")
                              : t("aiTopupPacksInactive")}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                          {item.sort_order}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatAiTime(item.updated_at, locale)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end">
                            <PackRowActions
                              item={item}
                              desktop
                              onEdit={openEdit}
                              onToggle={(row) => toggleMut.mutate(row)}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div
                className="space-y-2 md:hidden"
                data-testid="admin-ai-packs-cards-mobile"
              >
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border bg-card p-3"
                    data-testid={`pack-card-mobile-${item.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-foreground">
                          {item.code}
                        </p>
                        <p className="truncate text-sm font-medium text-foreground">
                          {item.label}
                        </p>
                      </div>
                      <Badge
                        variant={item.active ? "success" : "default"}
                        className="shrink-0 text-[10px] uppercase"
                        data-testid={`pack-status-mobile-${item.id}`}
                      >
                        {item.active
                          ? t("aiTopupPacksActive")
                          : t("aiTopupPacksInactive")}
                      </Badge>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <div className="min-w-0">
                        <dt>{t("aiTopupPacksColAmount")}</dt>
                        <dd className="font-mono tabular-nums text-foreground">
                          {formatIdr(item.amount_idr)}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt>{t("aiTopupPacksColBonus")}</dt>
                        <dd className="font-mono tabular-nums text-foreground">
                          {formatIdr(item.bonus_idr)}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt>{t("aiTopupPacksColSort")}</dt>
                        <dd className="font-mono tabular-nums text-foreground">
                          {item.sort_order}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt>{t("aiTopupPacksColUpdated")}</dt>
                        <dd className="text-foreground">
                          {formatAiTime(item.updated_at, locale)}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex justify-end">
                      <PackRowActions
                        item={item}
                        desktop={false}
                        onEdit={openEdit}
                        onToggle={(row) => toggleMut.mutate(row)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </AdminShellBody>
      </AdminShell>

      <Sheet
        open={form !== null}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-lg"
          data-testid="admin-ai-packs-form"
        >
          <SheetHeader>
            <SheetTitle>
              {editing
                ? t("aiTopupPacksEditTitle")
                : t("aiTopupPacksCreateTitle")}
            </SheetTitle>
            <SheetDescription>{t("aiTopupPacksFormHint")}</SheetDescription>
          </SheetHeader>
          {form ? (
            <form
              className="space-y-4 px-4 pb-4"
              onSubmit={(event) => {
                event.preventDefault();
                submitForm();
              }}
            >
              <FormAlert message={formError} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="pack-code">{t("aiTopupPacksFieldCode")}</Label>
                  <Input
                    id="pack-code"
                    data-testid="admin-ai-packs-code"
                    className="h-10 min-h-10 font-mono text-xs"
                    value={form.code}
                    maxLength={32}
                    placeholder={t("aiTopupPacksCodePlaceholder")}
                    onChange={(event) => {
                      patchForm({ code: event.target.value });
                      clearFieldError("code");
                    }}
                    aria-invalid={Boolean(fieldError("code"))}
                    aria-describedby="pack-code-error"
                  />
                  <FieldError
                    id="pack-code-error"
                    message={fieldError("code")}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="pack-label">
                    {t("aiTopupPacksFieldLabel")}
                  </Label>
                  <Input
                    id="pack-label"
                    data-testid="admin-ai-packs-label"
                    className="h-10 min-h-10"
                    value={form.label}
                    maxLength={64}
                    onChange={(event) => {
                      patchForm({ label: event.target.value });
                      clearFieldError("label");
                    }}
                    aria-invalid={Boolean(fieldError("label"))}
                    aria-describedby="pack-label-error"
                  />
                  <FieldError
                    id="pack-label-error"
                    message={fieldError("label")}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="pack-amount">
                    {t("aiTopupPacksFieldAmount")}
                  </Label>
                  <Input
                    id="pack-amount"
                    data-testid="admin-ai-packs-amount"
                    className="h-10 min-h-10 font-mono text-xs"
                    inputMode="numeric"
                    value={form.amount_idr}
                    placeholder="50000"
                    onChange={(event) => {
                      patchForm({ amount_idr: event.target.value });
                      clearFieldError("amount_idr");
                    }}
                    aria-invalid={Boolean(fieldError("amount_idr"))}
                    aria-describedby="pack-amount-error"
                  />
                  <FieldError
                    id="pack-amount-error"
                    message={fieldError("amount_idr")}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="pack-bonus">
                    {t("aiTopupPacksFieldBonus")}
                  </Label>
                  <Input
                    id="pack-bonus"
                    data-testid="admin-ai-packs-bonus"
                    className="h-10 min-h-10 font-mono text-xs"
                    inputMode="numeric"
                    value={form.bonus_idr}
                    placeholder="0"
                    onChange={(event) => {
                      patchForm({ bonus_idr: event.target.value });
                      clearFieldError("bonus_idr");
                    }}
                    aria-invalid={Boolean(fieldError("bonus_idr"))}
                    aria-describedby="pack-bonus-error"
                  />
                  <FieldError
                    id="pack-bonus-error"
                    message={fieldError("bonus_idr")}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="pack-sort">
                    {t("aiTopupPacksFieldSort")}
                  </Label>
                  <Input
                    id="pack-sort"
                    data-testid="admin-ai-packs-sort"
                    className="h-10 min-h-10 font-mono text-xs"
                    inputMode="numeric"
                    value={form.sort_order}
                    placeholder="0"
                    onChange={(event) => {
                      patchForm({ sort_order: event.target.value });
                      clearFieldError("sort_order");
                    }}
                    aria-invalid={Boolean(fieldError("sort_order"))}
                    aria-describedby="pack-sort-error"
                  />
                  <FieldError
                    id="pack-sort-error"
                    message={fieldError("sort_order")}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeForm}>
                  {t("cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  data-testid="admin-ai-packs-submit"
                >
                  {saving ? (
                    <Loader2
                      className="mr-1 h-3.5 w-3.5 animate-spin"
                      aria-hidden
                    />
                  ) : null}
                  {editing ? t("aiTopupPacksSave") : t("aiTopupPacksCreate")}
                </Button>
              </div>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default AdminAiTopupPacks;
