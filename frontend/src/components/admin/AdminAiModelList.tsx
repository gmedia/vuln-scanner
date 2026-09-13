import { useTranslation } from "react-i18next";
import type { AiModelAdmin } from "@/api/admin";
import { formatIdr } from "@/components/admin/aiFormat";
import { AdminAiField } from "@/components/admin/AdminAiField";
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

export function AdminAiModelList({
  models,
  editingModel,
  editPublicId,
  editUpstreamId,
  editPriceIn,
  editPriceOut,
  savePending,
  onEditPublicId,
  onEditUpstreamId,
  onEditPriceIn,
  onEditPriceOut,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  readonly models: readonly AiModelAdmin[];
  readonly editingModel: AiModelAdmin | null;
  readonly editPublicId: string;
  readonly editUpstreamId: string;
  readonly editPriceIn: string;
  readonly editPriceOut: string;
  readonly savePending: boolean;
  readonly onEditPublicId: (v: string) => void;
  readonly onEditUpstreamId: (v: string) => void;
  readonly onEditPriceIn: (v: string) => void;
  readonly onEditPriceOut: (v: string) => void;
  readonly onStartEdit: (m: AiModelAdmin) => void;
  readonly onCancelEdit: () => void;
  readonly onSave: () => void;
  readonly onDelete: (id: string) => void;
}) {
  const { t } = useTranslation("admin");
  if (models.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("aiModelsEmpty")}</p>;
  }
  return (
    <>
      <div className="space-y-2 md:hidden" data-testid="admin-ai-models-mobile">
        {models.map((m) => (
          <div
            key={m.id}
            className="rounded-lg border border-border bg-card p-3"
            data-testid={`admin-ai-model-card-${m.id}`}
          >
            {editingModel?.id === m.id ? (
              <div className="space-y-3">
                <AdminAiField
                  id={`ai-m-edit-pub-${m.id}`}
                  label={t("aiPublicId")}
                  value={editPublicId}
                  onChange={onEditPublicId}
                />
                <AdminAiField
                  id={`ai-m-edit-up-${m.id}`}
                  label={t("aiUpstreamId")}
                  value={editUpstreamId}
                  onChange={onEditUpstreamId}
                />
                <AdminAiField
                  id={`ai-m-edit-in-${m.id}`}
                  label={t("aiPriceIn")}
                  value={editPriceIn}
                  onChange={onEditPriceIn}
                />
                <AdminAiField
                  id={`ai-m-edit-out-${m.id}`}
                  label={t("aiPriceOut")}
                  value={editPriceOut}
                  onChange={onEditPriceOut}
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
                <p className="min-w-0 break-all font-mono text-sm font-medium text-foreground">
                  {m.public_id}
                </p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {m.upstream_id}
                </p>
                <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                  {t("aiPriceIn")}: {formatIdr(m.price_idr_per_1k_in)} · {t("aiPriceOut")}:{" "}
                  {formatIdr(m.price_idr_per_1k_out)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onStartEdit(m)}
                  >
                    {t("aiEdit")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => onDelete(m.id)}
                  >
                    {t("aiDelete")}
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block" data-testid="admin-ai-models-desktop">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("aiPublicId")}</TableHead>
              <TableHead>{t("aiUpstreamId")}</TableHead>
              <TableHead>{t("aiPriceIn")}</TableHead>
              <TableHead>{t("aiPriceOut")}</TableHead>
              <TableHead>{t("colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  {editingModel?.id === m.id ? (
                    <Input
                      aria-label={t("aiPublicId")}
                      value={editPublicId}
                      onChange={(e) => onEditPublicId(e.target.value)}
                    />
                  ) : (
                    m.public_id
                  )}
                </TableCell>
                <TableCell>
                  {editingModel?.id === m.id ? (
                    <div className="space-y-2">
                      <Input
                        aria-label={t("aiUpstreamId")}
                        value={editUpstreamId}
                        onChange={(e) => onEditUpstreamId(e.target.value)}
                      />
                      <AdminAiField
                        id={`ai-m-edit-in-${m.id}`}
                        label={t("aiPriceIn")}
                        value={editPriceIn}
                        onChange={onEditPriceIn}
                      />
                      <AdminAiField
                        id={`ai-m-edit-out-${m.id}`}
                        label={t("aiPriceOut")}
                        value={editPriceOut}
                        onChange={onEditPriceOut}
                      />
                    </div>
                  ) : (
                    m.upstream_id
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatIdr(m.price_idr_per_1k_in)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatIdr(m.price_idr_per_1k_out)}
                </TableCell>
                <TableCell className="space-x-2 whitespace-nowrap">
                  {editingModel?.id === m.id ? (
                    <>
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
                        onClick={() => onStartEdit(m)}
                      >
                        {t("aiEdit")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => onDelete(m.id)}
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
