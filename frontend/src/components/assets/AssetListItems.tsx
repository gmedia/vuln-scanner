import type { ScanAsset } from "@/api/assets";
import {
  AssetGuardCell,
  AssetRowMenu,
  AssetTagBadges,
  AssetTypeChip,
  type AssetItemActions,
} from "@/components/assets/AssetItemChrome";
import { assetRailClass } from "@/components/assets/assetChrome";
import { SiemRail } from "@/components/siem/siemChrome";
import {
  TableCell,
  TableRow,
} from "@/components/ui/Table";

export function AssetCard({
  asset,
  actions,
}: {
  readonly asset: ScanAsset;
  readonly actions: AssetItemActions;
}) {
  const { t } = actions;
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-border bg-card p-3 pl-4"
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
