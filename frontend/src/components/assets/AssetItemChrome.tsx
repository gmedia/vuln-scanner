import { Link } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import type { ScanAsset, TagColorValue } from "@/api/assets";
import {
  assetTypeChipClass,
  typeLabelKey,
  type AssetTranslate,
} from "@/components/assets/assetChrome";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { tagColorClass, tagColorStyle } from "@/lib/tagColors";

export type AssetItemActions = {
  readonly colorMap: Record<string, TagColorValue>;
  readonly onToggleTag: (tag: string) => void;
  readonly onEdit: (asset: ScanAsset) => void;
  readonly onSchedule: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly t: AssetTranslate;
};

export function AssetTypeChip({
  scanType,
  t,
}: {
  readonly scanType: string;
  readonly t: AssetTranslate;
}) {
  return (
    <Badge className={assetTypeChipClass(scanType)}>
      {t(typeLabelKey(scanType))}
    </Badge>
  );
}

export function AssetTagBadges({
  asset,
  testIdPrefix,
  colorMap,
  onToggleTag,
}: {
  readonly asset: ScanAsset;
  readonly testIdPrefix: string;
  readonly colorMap: Record<string, TagColorValue>;
  readonly onToggleTag: (tag: string) => void;
}) {
  if ((asset.tags ?? []).length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {asset.tags.map((tag) => (
        <Button
          key={tag}
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto min-h-11 p-0 md:min-h-0"
          onClick={() => onToggleTag(tag)}
        >
          <Badge
            variant="default"
            data-testid={`${testIdPrefix}-${tag}`}
            className={tagColorClass(tag, colorMap)}
            style={tagColorStyle(tag, colorMap)}
          >
            {tag}
          </Badge>
        </Button>
      ))}
    </div>
  );
}

export function AssetGuardCell({
  asset,
  testId,
  t,
}: {
  readonly asset: ScanAsset;
  readonly testId: string;
  readonly t: AssetTranslate;
}) {
  if (!asset.guard_agent_id) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="info" data-testid={testId}>
        {t("guardLinked", {
          name: asset.guard_agent_name ?? asset.guard_agent_id,
        })}
      </Badge>
      <Button variant="link" size="sm" className="h-auto min-h-11 p-0 md:min-h-0" asChild>
        <Link to="/guard">{t("openGuard")}</Link>
      </Button>
    </div>
  );
}

export function AssetRowMenu({
  asset,
  surface,
  onEdit,
  onSchedule,
  onDelete,
  t,
}: {
  readonly asset: ScanAsset;
  readonly surface: "card" | "row";
  readonly onEdit: (asset: ScanAsset) => void;
  readonly onSchedule: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly t: AssetTranslate;
}) {
  const tid = (base: string) => (surface === "card" ? `${base}-card` : base);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-11 w-11 min-h-11 min-w-11 p-0 md:h-9 md:w-9 md:min-h-9 md:min-w-9"
          data-testid={tid(`asset-menu-${asset.id}`)}
          aria-label={t("actionsMenu")}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          data-testid={tid(`asset-edit-${asset.id}`)}
          onSelect={() => onEdit(asset)}
        >
          {t("edit")}
        </DropdownMenuItem>
        {!asset.schedule_id ? (
          <DropdownMenuItem
            data-testid={tid(`asset-schedule-${asset.id}`)}
            onSelect={() => onSchedule(asset.id)}
          >
            {t("schedule")}
          </DropdownMenuItem>
        ) : null}
        {asset.scan_type === "domain" ? (
          <DropdownMenuItem asChild>
            <Link to="/uptime" data-testid={tid("assets-watch-http")}>
              {t("watchHttp")}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          data-testid={tid(`asset-delete-${asset.id}`)}
          onSelect={() => {
            if (window.confirm(t("confirmDelete"))) onDelete(asset.id);
          }}
        >
          {t("delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
