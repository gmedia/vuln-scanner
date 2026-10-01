import { ChevronDown } from "lucide-react";
import { AssetFormSheet } from "@/components/assets/AssetFormSheet";
import {
  AssetKpiSkeleton,
  AssetKpiStrip,
} from "@/components/assets/AssetKpiStrip";
import { AssetListPanel } from "@/components/assets/AssetListPanel";
import {
  downloadPackHtml,
  downloadPackJson,
} from "@/components/assets/assetChrome";
import { useAssetsPage } from "@/components/assets/useAssetsPage";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PageHeader from "@/components/layout/PageHeader";

export default function Assets() {
  const a = useAssetsPage();
  const { t } = a;

  return (
    <div className="space-y-6" data-testid="assets-page">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
            {a.items.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="min-h-10">
                    {t("exportPack")}
                    <ChevronDown className="ml-1 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    data-testid="assets-pack"
                    onSelect={() => {
                      void downloadPackJson();
                    }}
                  >
                    {t("pack")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="assets-pack-html"
                    onSelect={() => {
                      void downloadPackHtml();
                    }}
                  >
                    {t("packHtml")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {a.items.length > 0 ? (
              <Button
                data-testid="assets-add"
                className="min-h-11 sm:min-h-10"
                disabled={a.atCap}
                onClick={a.openAdd}
              >
                {t("add")}
              </Button>
            ) : null}
          </>
        }
      />

      <AssetFormSheet
        open={a.open}
        editing={a.editing}
        name={a.name}
        target={a.target}
        scanType={a.scanType}
        notes={a.notes}
        tagsInput={a.tagsInput}
        savePending={a.createMut.isPending || a.updateMut.isPending}
        onOpenChange={(next) => {
          if (!next) a.resetForm();
          else a.setOpen(true);
        }}
        onName={a.setName}
        onTarget={a.setTarget}
        onScanType={a.setScanType}
        onNotes={a.setNotes}
        onTagsInput={a.setTagsInput}
        onSave={a.saveAsset}
        onCancel={a.resetForm}
        t={t}
      />

      {a.list.isLoading ? (
        <AssetKpiSkeleton />
      ) : (
        <AssetKpiStrip
          sku={a.sku}
          count={a.items.length}
          limit={a.limit}
          scheduled={a.scheduled}
          domains={a.domains}
          ips={a.ips}
          t={t}
        />
      )}

      <AssetListPanel
        loading={a.list.isLoading}
        items={a.items}
        visible={a.visible}
        atCap={a.atCap}
        search={a.search}
        typeFilter={a.typeFilter}
        allTags={a.allTags}
        tagOptions={a.tagOptions}
        tagFilters={a.tagFilters}
        tagQuery={a.tagQuery}
        colorMap={a.colorMap}
        onSearch={a.setSearch}
        onTypeFilter={a.setTypeFilter}
        onToggleTag={a.toggleTagFilter}
        onClearTags={a.clearTagFilters}
        onTagQuery={a.setTagQuery}
        onPickColor={(tag, color) => a.colorMut.mutate({ [tag]: color })}
        onClearAll={a.clearFilters}
        onAdd={a.openAdd}
        actions={{
          colorMap: a.colorMap,
          onToggleTag: a.toggleTagFilter,
          onEdit: a.startEdit,
          onSchedule: (id) => a.schedMut.mutate(id),
          onDelete: (id) => a.delMut.mutate(id),
          t,
        }}
        t={t}
      />
    </div>
  );
}
