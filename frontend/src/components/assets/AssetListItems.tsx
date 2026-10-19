import { useState } from "react";
import type { ScanAsset } from "@/api/assets";
import {
  AssetGuardCell,
  AssetRowMenu,
  AssetTagBadges,
  AssetTypeChip,
  type AssetItemActions,
} from "@/components/assets/AssetItemChrome";
import { assetRailClass } from "@/components/assets/assetChrome";
import { SwipeableRow } from "@/components/gesture/SwipeableRow";
import { SiemRail } from "@/components/siem/siemChrome";
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
  TableCell,
  TableRow,
} from "@/components/ui/Table";
import { Trash2 } from "lucide-react";
import { RAILED_ROW_CLASS } from "@/components/patterns/RailedShell";

export function AssetCard({
  asset,
  actions,
}: {
  readonly asset: ScanAsset;
  readonly actions: AssetItemActions;
}) {
  const { t } = actions;
  const [deleteOpen, setDeleteOpen] = useState(false);
  return (
    <>
      <SwipeableRow
        actions={
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-full w-full flex-col gap-1 rounded-none"
            data-testid={`asset-swipe-delete-${asset.id}`}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            <span className="text-[10px]">{t("delete")}</span>
          </Button>
        }
      >
        <div
          className={RAILED_ROW_CLASS}
          data-testid={`asset-card-${asset.id}`}
        >
          <SiemRail className={assetRailClass(asset.scan_type)} />
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 break-words text-sm font-medium text-foreground">
              {asset.name}
            </p>
            <AssetTypeChip scanType={asset.scan_type} t={t} />
          </div>
          <p className="mt-1 break-all font-mono text-xs tabular-nums text-muted-foreground">
            {asset.target}
          </p>
          {(asset.tags ?? []).length > 0 || asset.guard_agent_id ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <AssetTagBadges
                asset={asset}
                testIdPrefix="asset-tag-card"
                colorMap={actions.colorMap}
                onToggleTag={actions.onToggleTag}
              />
              {asset.guard_agent_id ? (
                <AssetGuardCell
                  asset={asset}
                  testId={`asset-guard-chip-${asset.id}-card`}
                  t={t}
                />
              ) : null}
            </div>
          ) : null}
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{asset.schedule_id ? t("hasSchedule") : "—"}</span>
            <AssetRowMenu
              asset={asset}
              surface="card"
              onEdit={actions.onEdit}
              onSchedule={actions.onSchedule}
              onDelete={actions.onDelete}
              t={t}
            />
          </div>
        </div>
      </SwipeableRow>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmDelete")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => actions.onDelete(asset.id)}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function AssetTableRow({
  asset,
  actions,
}: {
  readonly asset: ScanAsset;
  readonly actions: AssetItemActions;
}) {
  const { t } = actions;
  return (
    <TableRow className="h-12">
      <TableCell className="relative pl-4 font-medium">
        <SiemRail className={assetRailClass(asset.scan_type)} />
        {asset.name}
      </TableCell>
      <TableCell>
        <AssetTypeChip scanType={asset.scan_type} t={t} />
      </TableCell>
      <TableCell className="font-mono tabular-nums">{asset.target}</TableCell>
      <TableCell>
        <AssetTagBadges
          asset={asset}
          testIdPrefix="asset-tag"
          colorMap={actions.colorMap}
          onToggleTag={actions.onToggleTag}
        />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {asset.schedule_id ? t("hasSchedule") : "—"}
      </TableCell>
      <TableCell>
        <AssetGuardCell
          asset={asset}
          testId={`asset-guard-chip-${asset.id}`}
          t={t}
        />
      </TableCell>
      <TableCell className="text-right">
        <AssetRowMenu
          asset={asset}
          surface="row"
          onEdit={actions.onEdit}
          onSchedule={actions.onSchedule}
          onDelete={actions.onDelete}
          t={t}
        />
      </TableCell>
    </TableRow>
  );
}
