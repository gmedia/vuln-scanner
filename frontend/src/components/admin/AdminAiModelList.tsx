import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AiModelAdmin } from "@/api/admin";
import {
  formatPricePerTokens,
  type AiPriceUnit,
} from "@/components/admin/aiFormat";
import { AdminAiField } from "@/components/admin/AdminAiField";
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

export function AdminAiModelList({
  models,
  unit,
  usdIdr,
  priceLabelIn,
  priceLabelOut,
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
  readonly unit: AiPriceUnit;
  readonly usdIdr: number;
  readonly priceLabelIn: string;
  readonly priceLabelOut: string;
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
  const [deleteTarget, setDeleteTarget] = useState<AiModelAdmin | null>(null);
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
                  label={priceLabelIn}
                  value={editPriceIn}
                  onChange={onEditPriceIn}
                />
                <AdminAiField
                  id={`ai-m-edit-out-${m.id}`}
                  label={priceLabelOut}
                  value={editPriceOut}
                  onChange={onEditPriceOut}
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
                <p className="min-w-0 break-all font-mono text-sm font-medium text-foreground">
                  {m.public_id}
                </p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {m.upstream_id}
                </p>
                <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                  {priceLabelIn}: {formatPricePerTokens(m.price_idr_per_1k_in, unit, usdIdr)} ·{" "}
                  {priceLabelOut}:{" "}
                  {formatPricePerTokens(m.price_idr_per_1k_out, unit, usdIdr)}
                </p>
                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-11 w-11 min-h-11 min-w-11 p-0 md:h-9 md:w-9 md:min-h-9 md:min-w-9"
                        data-testid={`admin-ai-model-actions-${m.id}`}
                        aria-label={t("actionsMenu")}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        data-testid={`admin-ai-model-edit-${m.id}`}
                        onSelect={() => onStartEdit(m)}
                      >
                        {t("aiEdit")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        data-testid={`admin-ai-model-delete-${m.id}`}
                        onSelect={() => setDeleteTarget(m)}
                      >
                        {t("aiDelete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
              <TableHead>{priceLabelIn}</TableHead>
              <TableHead>{priceLabelOut}</TableHead>
              <TableHead className="text-right">{t("colActions")}</TableHead>
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
                        label={priceLabelIn}
                        value={editPriceIn}
                        onChange={onEditPriceIn}
                      />
                      <AdminAiField
                        id={`ai-m-edit-out-${m.id}`}
                        label={priceLabelOut}
                        value={editPriceOut}
                        onChange={onEditPriceOut}
                      />
                    </div>
                  ) : (
                    m.upstream_id
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatPricePerTokens(m.price_idr_per_1k_in, unit, usdIdr)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatPricePerTokens(m.price_idr_per_1k_out, unit, usdIdr)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
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
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-9 w-9 p-0"
                            data-testid={`admin-ai-model-actions-${m.id}`}
                            aria-label={t("actionsMenu")}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            data-testid={`admin-ai-model-edit-${m.id}`}
                            onSelect={() => onStartEdit(m)}
                          >
                            {t("aiEdit")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            data-testid={`admin-ai-model-delete-${m.id}`}
                            onSelect={() => setDeleteTarget(m)}
                          >
                            {t("aiDelete")}
                          </DropdownMenuItem>
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
            <AlertDialogTitle>{t("aiModelDeleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("aiModelDeleteConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              data-testid="admin-ai-model-delete-confirm"
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
