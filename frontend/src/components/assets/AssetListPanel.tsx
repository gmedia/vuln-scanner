import { Globe } from "lucide-react";
import type { ScanAsset, TagColorValue } from "@/api/assets";
import { AssetFilters, type AssetTypeFilter } from "@/components/assets/AssetFilters";
import { type AssetItemActions } from "@/components/assets/AssetItemChrome";
import { AssetCard, AssetTableRow } from "@/components/assets/AssetListItems";
import { type AssetTranslate } from "@/components/assets/assetChrome";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/patterns/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton, TableRowSkeleton } from "@/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";

export type AssetListPanelProps = {
  readonly loading: boolean;
  readonly items: readonly ScanAsset[];
  readonly visible: readonly ScanAsset[];
  readonly atCap: boolean;
  readonly search: string;
  readonly typeFilter: AssetTypeFilter;
  readonly allTags: readonly string[];
  readonly tagOptions: readonly string[];
  readonly tagFilters: readonly string[];
  readonly tagQuery: string;
  readonly colorMap: Record<string, TagColorValue>;
  readonly onSearch: (value: string) => void;
  readonly onTypeFilter: (value: AssetTypeFilter) => void;
  readonly onToggleTag: (tag: string) => void;
  readonly onClearTags: () => void;
  readonly onTagQuery: (value: string) => void;
  readonly onPickColor: (tag: string, color: TagColorValue) => void;
  readonly onClearAll: () => void;
  readonly onAdd: () => void;
  readonly actions: AssetItemActions;
  readonly t: AssetTranslate;
};

export function AssetListPanel({
  loading,
  items,
  visible,
  atCap,
  search,
  typeFilter,
  allTags,
  tagOptions,
  tagFilters,
  tagQuery,
  colorMap,
  onSearch,
  onTypeFilter,
  onToggleTag,
  onClearTags,
  onTagQuery,
  onPickColor,
  onClearAll,
  onAdd,
  actions,
  t,
}: AssetListPanelProps) {
  if (loading) {
    return (
      <Card data-testid="assets-loading">
        <CardHeader className="flex flex-col gap-3 space-y-0 border-b border-border p-3">
          <CardTitle className="text-sm tracking-wide">{t("tableTitle")}</CardTitle>
          <div
            className="flex flex-col gap-3 sm:flex-row"
            data-testid="assets-filters-loading"
            aria-hidden
          >
            <Skeleton className="h-10 min-w-0 flex-1" />
            <Skeleton className="h-10 sm:w-40" />
            <Skeleton className="h-10 sm:w-36" />
          </div>
        </CardHeader>
        <CardContent>
          <TableRowSkeleton rows={5} columns={7} />
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        testId="assets-empty"
        size="md"
        className="py-16 md:py-20"
        icon={Globe}
        title={t("empty")}
        titleClassName="text-balance"
        hint={t("emptyHint")}
        hintClassName="text-balance text-sm"
        action={
          <Button
            className="mt-2 min-h-11"
            data-testid="assets-empty-cta"
            disabled={atCap}
            onClick={onAdd}
          >
            {t("emptyCta")}
          </Button>
        }
      />
    );
  }

  return (
    <Card data-testid="assets-list">
      <CardHeader className="flex flex-col gap-0 space-y-0 border-b border-border p-3">
        <CardTitle className="sr-only">{t("tableTitle")}</CardTitle>
        <AssetFilters
          search={search}
          typeFilter={typeFilter}
          allTags={allTags}
          tagOptions={tagOptions}
          tagFilters={tagFilters}
          tagQuery={tagQuery}
          colorMap={colorMap}
          onSearch={onSearch}
          onTypeFilter={onTypeFilter}
          onToggleTag={onToggleTag}
          onClearTags={onClearTags}
          onTagQuery={onTagQuery}
          onPickColor={onPickColor}
          onClearAll={onClearAll}
          counts={{ shown: visible.length, total: items.length }}
        />
      </CardHeader>
      <CardContent className="p-0">
        {visible.length === 0 ? (
          <EmptyState
            testId="assets-no-match"
            size="none"
            variant="bare"
            className="min-h-[8rem] gap-3 px-6 py-10"
            title={t("noTagMatch")}
            titleTone="muted"
            action={
              <Button
                type="button"
                variant="outline"
                data-testid="assets-clear-filters"
                onClick={onClearAll}
              >
                {t("clearFilters")}
              </Button>
            }
          />
        ) : (
          <>
            <div className="space-y-2 p-3 md:hidden" data-testid="assets-list-mobile">
              {visible.map((asset) => (
                <AssetCard key={asset.id} asset={asset} actions={actions} />
              ))}
            </div>
            <div
              className="hidden overflow-x-auto md:block"
              data-testid="assets-list-desktop"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("name")}</TableHead>
                    <TableHead>{t("type")}</TableHead>
                    <TableHead>{t("target")}</TableHead>
                    <TableHead>{t("tags")}</TableHead>
                    <TableHead>{t("colSchedule")}</TableHead>
                    <TableHead>{t("colGuard")}</TableHead>
                    <TableHead className="w-12 text-right">
                      <span className="sr-only">{t("colActions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((asset) => (
                    <AssetTableRow key={asset.id} asset={asset} actions={actions} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
