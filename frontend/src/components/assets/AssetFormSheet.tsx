import type { ScanAsset } from "@/api/assets";
import {
  parseScanType,
  type AssetScanType,
  type AssetTranslate,
} from "@/components/assets/assetChrome";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export type AssetFormSheetProps = {
  readonly open: boolean;
  readonly editing: ScanAsset | null;
  readonly name: string;
  readonly target: string;
  readonly scanType: AssetScanType;
  readonly notes: string;
  readonly tagsInput: string;
  readonly savePending: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onName: (value: string) => void;
  readonly onTarget: (value: string) => void;
  readonly onScanType: (value: AssetScanType) => void;
  readonly onNotes: (value: string) => void;
  readonly onTagsInput: (value: string) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
  readonly t: AssetTranslate;
};

export function AssetFormSheet({
  open,
  editing,
  name,
  target,
  scanType,
  notes,
  tagsInput,
  savePending,
  onOpenChange,
  onName,
  onTarget,
  onScanType,
  onNotes,
  onTagsInput,
  onSave,
  onCancel,
  t,
}: AssetFormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editing ? t("editTitle") : t("add")}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 px-4">
          <div>
            <Label htmlFor="asset-name">{t("name")}</Label>
            <Input
              id="asset-name"
              data-testid="asset-name"
              value={name}
              onChange={(e) => onName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="asset-type">{t("type")}</Label>
            <Select
              value={scanType}
              onValueChange={(value) => onScanType(parseScanType(value))}
            >
              <SelectTrigger
                id="asset-type"
                data-testid="asset-type"
                aria-label={t("type")}
                disabled={Boolean(editing)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="domain">{t("typeDomain")}</SelectItem>
                <SelectItem value="ip">{t("typeIp")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="asset-target">{t("target")}</Label>
            <Input
              id="asset-target"
              data-testid="asset-target"
              value={target}
              disabled={Boolean(editing)}
              onChange={(e) => onTarget(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="asset-notes">{t("notes")}</Label>
            <Input
              id="asset-notes"
              value={notes}
              onChange={(e) => onNotes(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="asset-tags">{t("tags")}</Label>
            <Input
              id="asset-tags"
              data-testid="asset-tags"
              value={tagsInput}
              onChange={(e) => onTagsInput(e.target.value)}
              placeholder={t("tagsHint")}
            />
          </div>
        </div>
        <SheetFooter>
          <Button
            data-testid="asset-save"
            disabled={
              !name.trim() || (!editing && !target.trim()) || savePending
            }
            onClick={onSave}
          >
            {t("save")}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            {t("cancel")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
