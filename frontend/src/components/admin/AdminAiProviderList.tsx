import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AiProviderAdmin } from "@/api/admin";
import { Button } from "@/components/ui/Button";
import { buttonVariants } from "@/components/ui/buttonVariants";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/Input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { AdminAiField } from "@/components/admin/AdminAiField";

function ProviderStateBadge({
  provider,
}: {
  readonly provider: AiProviderAdmin;
}) {
  const { t } = useTranslation("admin");
  const off = !provider.enabled || provider.status === "disabled";
  const degraded = !off && provider.status === "degraded";
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-xs ${
        off
          ? "border-destructive/40 text-destructive"
          : "border-border text-muted-foreground"
      }`}
      data-testid={`admin-ai-provider-state-${provider.id}`}
    >
      {t(
        off
          ? "aiProviderStateOff"
          : degraded
            ? "aiProviderStateDegraded"
            : "aiProviderStateOk",
      )}
    </span>
  );
}

function formatProbeTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ProbeTime({
  provider,
  locale,
}: {
  readonly provider: AiProviderAdmin;
  readonly locale: string;
}) {
  const { t } = useTranslation("admin");
  return (
    <span
      className="block text-xs text-muted-foreground"
      data-testid={`admin-ai-provider-probed-${provider.id}`}
    >
      {provider.last_probed_at
        ? t("aiProviderLastChecked", {
            when: formatProbeTime(provider.last_probed_at, locale),
          })
        : t("aiProviderNeverChecked")}
    </span>
  );
}

function ProviderMenuItems({
  provider,
  togglePending,
  onStartEdit,
  onToggleEnabled,
  onDelete,
}: {
  readonly provider: AiProviderAdmin;
  readonly togglePending: boolean;
  readonly onStartEdit: (p: AiProviderAdmin) => void;
  readonly onToggleEnabled: (p: AiProviderAdmin, enabled: boolean) => void;
  readonly onDelete: (p: AiProviderAdmin) => void;
}) {
  const { t } = useTranslation("admin");
  const off = !provider.enabled || provider.status === "disabled";
  return (
    <>
      <DropdownMenuItem
        data-testid={`admin-ai-provider-edit-${provider.id}`}
        onSelect={() => onStartEdit(provider)}
      >
        {t("aiEdit")}
      </DropdownMenuItem>
      <DropdownMenuItem
        data-testid={`ai-provider-toggle-${provider.id}`}
        disabled={togglePending}
        onSelect={() => onToggleEnabled(provider, off)}
      >
        {off ? t("aiProviderEnable") : t("aiProviderDisable")}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        data-testid={`admin-ai-provider-delete-${provider.id}`}
        onSelect={() => onDelete(provider)}
      >
        {t("aiDelete")}
      </DropdownMenuItem>
    </>
  );
}

export function AdminAiProviderList({
  providers,
  editingProv,
  editProvName,
  editProvUrl,
  editProvCred,
  savePending,
  togglePending,
  onEditName,
  onEditUrl,
  onEditCred,
  onStartEdit,
  onCancelEdit,
  onSave,
  onToggleEnabled,
  onDelete,
}: {
  readonly providers: readonly AiProviderAdmin[];
  readonly editingProv: AiProviderAdmin | null;
  readonly editProvName: string;
  readonly editProvUrl: string;
  readonly editProvCred: string;
  readonly savePending: boolean;
  readonly togglePending: boolean;
  readonly onEditName: (v: string) => void;
  readonly onEditUrl: (v: string) => void;
  readonly onEditCred: (v: string) => void;
  readonly onStartEdit: (p: AiProviderAdmin) => void;
  readonly onCancelEdit: () => void;
  readonly onSave: () => void;
  readonly onToggleEnabled: (p: AiProviderAdmin, enabled: boolean) => void;
  readonly onDelete: (id: string) => void;
}) {
  const { t, i18n } = useTranslation("admin");
  const dateLocale = i18n.language === "en" ? "en-US" : "id-ID";
  const [deleteTarget, setDeleteTarget] = useState<AiProviderAdmin | null>(null);
  if (providers.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("aiProvidersEmpty")}</p>;
  }
  return (
    <>
      <div className="space-y-2 md:hidden" data-testid="admin-ai-providers-mobile">
        {providers.map((p) => (
          <div
            key={p.id}
            className="rounded-lg border border-border bg-card p-3"
            data-testid={`admin-ai-provider-card-${p.id}`}
          >
            {editingProv?.id === p.id ? (
              <div className="space-y-3">
                <AdminAiField
                  id={`ai-p-edit-name-${p.id}`}
                  label={t("aiName")}
                  value={editProvName}
                  onChange={onEditName}
                />
                <AdminAiField
                  id={`ai-p-edit-url-${p.id}`}
                  label={t("aiBaseUrl")}
                  value={editProvUrl}
                  onChange={onEditUrl}
                />
                <AdminAiField
                  id={`ai-p-edit-cred-${p.id}`}
                  label={t("aiCredential")}
                  value={editProvCred}
                  onChange={onEditCred}
                  type="password"
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" size="sm" onClick={onSave} disabled={savePending}>
                    {t("aiSave")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={onCancelEdit}>
                    {t("aiCancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 break-words text-sm font-medium text-foreground">
                    {p.name}
                  </p>
                  <ProviderStateBadge provider={p} />
                </div>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {p.base_url}
                </p>
                <ProbeTime provider={p} locale={dateLocale} />
                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-11 w-11 min-h-11 min-w-11 p-0 md:h-9 md:w-9 md:min-h-9 md:min-w-9"
                        data-testid={`admin-ai-provider-actions-${p.id}`}
                        aria-label={t("actionsMenu")}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <ProviderMenuItems
                        provider={p}
                        togglePending={togglePending}
                        onStartEdit={onStartEdit}
                        onToggleEnabled={onToggleEnabled}
                        onDelete={setDeleteTarget}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block" data-testid="admin-ai-providers-desktop">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("aiName")}</TableHead>
              <TableHead>{t("aiBaseUrl")}</TableHead>
              <TableHead>{t("colStatus")}</TableHead>
              <TableHead className="text-right">{t("colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  {editingProv?.id === p.id ? (
                    <Input
                      aria-label={t("aiName")}
                      value={editProvName}
                      onChange={(e) => onEditName(e.target.value)}
                    />
                  ) : (
                    p.name
                  )}
                </TableCell>
                <TableCell className="max-w-[18rem] font-mono text-xs">
                  {editingProv?.id === p.id ? (
                    <Input
                      aria-label={t("aiBaseUrl")}
                      value={editProvUrl}
                      onChange={(e) => onEditUrl(e.target.value)}
                    />
                  ) : (
                    <span className="block truncate" title={p.base_url}>
                      {p.base_url}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <ProviderStateBadge provider={p} />
                  <ProbeTime provider={p} locale={dateLocale} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {editingProv?.id === p.id ? (
                    <>
                      <AdminAiField
                        id="ai-p-edit-cred"
                        label={t("aiCredential")}
                        value={editProvCred}
                        onChange={onEditCred}
                        type="password"
                      />
                      <Button type="button" size="sm" onClick={onSave} disabled={savePending}>
                        {t("aiSave")}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={onCancelEdit}>
                        {t("aiCancel")}
                      </Button>
                    </>
                  ) : (
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-9 w-9 p-0"
                            data-testid={`admin-ai-provider-actions-${p.id}`}
                            aria-label={t("actionsMenu")}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <ProviderMenuItems
                            provider={p}
                            togglePending={togglePending}
                            onStartEdit={onStartEdit}
                            onToggleEnabled={onToggleEnabled}
                            onDelete={setDeleteTarget}
                          />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("aiProviderDeleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("aiProviderDeleteConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              data-testid="admin-ai-provider-delete-confirm"
              onClick={() => {
                if (deleteTarget) onDelete(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              {t("aiDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
