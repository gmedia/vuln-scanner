import { useTranslation } from "react-i18next";
import type { AiProviderAdmin } from "@/api/admin";
import { Button } from "@/components/ui/Button";
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

export function AdminAiProviderList({
  providers,
  editingProv,
  editProvName,
  editProvUrl,
  editProvCred,
  savePending,
  onEditName,
  onEditUrl,
  onEditCred,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  readonly providers: readonly AiProviderAdmin[];
  readonly editingProv: AiProviderAdmin | null;
  readonly editProvName: string;
  readonly editProvUrl: string;
  readonly editProvCred: string;
  readonly savePending: boolean;
  readonly onEditName: (v: string) => void;
  readonly onEditUrl: (v: string) => void;
  readonly onEditCred: (v: string) => void;
  readonly onStartEdit: (p: AiProviderAdmin) => void;
  readonly onCancelEdit: () => void;
  readonly onSave: () => void;
  readonly onDelete: (id: string) => void;
}) {
  const { t } = useTranslation("admin");
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
                <div className="flex flex-wrap gap-2">
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
                <p className="min-w-0 break-words text-sm font-medium text-foreground">
                  {p.name}
                </p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {p.base_url}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onStartEdit(p)}
                  >
                    {t("aiEdit")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => onDelete(p.id)}
                  >
                    {t("aiDelete")}
                  </Button>
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
              <TableHead>{t("colActions")}</TableHead>
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
                <TableCell className="space-x-2 whitespace-nowrap">
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
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onStartEdit(p)}
                      >
                        {t("aiEdit")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => onDelete(p.id)}
                      >
                        {t("aiDelete")}
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
