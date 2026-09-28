import { useTranslation } from "react-i18next";
import type { GuardAgent } from "@/api/guard";
import {
  formatHelperPollAt,
  isHelperPollStale,
} from "@/lib/sinexisInstall";
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

export type CmsHint = "wordpress" | "laravel" | "unknown";

export type HostAddSiteSheetProps = {
  readonly open: boolean;
  readonly onOpenChange: (next: boolean) => void;
  readonly name: string;
  readonly onNameChange: (v: string) => void;
  readonly rootPath: string;
  readonly onRootPathChange: (v: string) => void;
  readonly agents: GuardAgent[];
  readonly selectedAgentId: string;
  readonly onAgentChange: (v: string) => void;
  readonly cmsHint: CmsHint;
  readonly onCmsHintChange: (v: CmsHint) => void;
  readonly scanInterval: "daily" | "hourly";
  readonly onScanIntervalChange: (v: "daily" | "hourly") => void;
  readonly autoQuarantine: boolean;
  readonly onAutoQuarantineChange: (v: boolean) => void;
  readonly watchOnWrite: boolean;
  readonly onWatchOnWriteChange: (v: boolean) => void;
  readonly saving: boolean;
  readonly onSave: () => void;
};

export default function HostAddSiteSheet({
  open,
  onOpenChange,
  name,
  onNameChange,
  rootPath,
  onRootPathChange,
  agents,
  selectedAgentId,
  onAgentChange,
  cmsHint,
  onCmsHintChange,
  scanInterval,
  onScanIntervalChange,
  autoQuarantine,
  onAutoQuarantineChange,
  watchOnWrite,
  onWatchOnWriteChange,
  saving,
  onSave,
}: HostAddSiteSheetProps) {
  const { t } = useTranslation("host");
  const saveDisabled =
    !name.trim() || !rootPath.trim() || !selectedAgentId || saving;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="overflow-y-auto sm:max-w-lg"
        data-testid="host-add-sheet"
      >
        {open ? (
          <>
            <SheetHeader>
              <SheetTitle>{t("add")}</SheetTitle>
              <p className="text-sm text-muted-foreground">
                {t("addSheetHint")}
              </p>
            </SheetHeader>
            <div className="space-y-4 px-4">
              <div className="space-y-1.5">
                <Label htmlFor="host-name">{t("name")}</Label>
                <Input
                  id="host-name"
                  data-testid="host-name"
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  className="h-10 min-h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="host-root">{t("rootPath")}</Label>
                <Input
                  id="host-root"
                  data-testid="host-root"
                  value={rootPath}
                  onChange={(e) => onRootPathChange(e.target.value)}
                  placeholder="/var/www/html"
                  className="h-10 min-h-10 font-mono text-xs"
                />
              </div>
              <p
                className="text-sm text-muted-foreground"
                data-testid="host-helper-required"
              >
                {t("helperRequired")}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="host-agent">{t("guardAgent")}</Label>
                <Select value={selectedAgentId} onValueChange={onAgentChange}>
                  <SelectTrigger
                    id="host-agent"
                    data-testid="host-agent"
                    aria-label={t("guardAgent")}
                    className="h-10 min-h-10"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedAgentId ? (
                  <p
                    className="text-xs text-muted-foreground"
                    data-testid="host-helper-poll-add"
                  >
                    {(() => {
                      const ag = agents.find((a) => a.id === selectedAgentId);
                      const iso = ag?.last_helper_poll_at ?? null;
                      const when = formatHelperPollAt(iso);
                      if (!when) return t("helperNeverPolled");
                      if (isHelperPollStale(iso)) {
                        return t("helperStale", { when });
                      }
                      return t("helperPolled", { when });
                    })()}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="host-cms">{t("cmsHint")}</Label>
                <Select
                  value={cmsHint}
                  onValueChange={(v) => onCmsHintChange(v as CmsHint)}
                >
                  <SelectTrigger
                    id="host-cms"
                    data-testid="host-cms"
                    aria-label={t("cmsHint")}
                    className="h-10 min-h-10"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">{t("cmsUnknown")}</SelectItem>
                    <SelectItem value="wordpress">
                      {t("cmsWordpress")}
                    </SelectItem>
                    <SelectItem value="laravel">{t("cmsLaravel")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="host-interval">{t("scanInterval")}</Label>
                <Select
                  value={scanInterval}
                  onValueChange={(v) =>
                    onScanIntervalChange(v as "daily" | "hourly")
                  }
                >
                  <SelectTrigger
                    id="host-interval"
                    data-testid="host-interval"
                    aria-label={t("scanInterval")}
                    className="h-10 min-h-10"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">{t("intervalDaily")}</SelectItem>
                    <SelectItem value="hourly">
                      {t("intervalHourly")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("intervalHint")}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="host-auto-quarantine">
                  {t("autoQuarantine")}
                </Label>
                <Select
                  value={autoQuarantine ? "on" : "off"}
                  onValueChange={(v) => onAutoQuarantineChange(v === "on")}
                >
                  <SelectTrigger
                    id="host-auto-quarantine"
                    data-testid="host-auto-quarantine"
                    aria-label={t("autoQuarantine")}
                    className="h-10 min-h-10"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">
                      {t("autoQuarantineOff")}
                    </SelectItem>
                    <SelectItem value="on">{t("autoQuarantineOn")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("autoQuarantineHint")}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="host-watch">{t("watchTitle")}</Label>
                <Select
                  value={watchOnWrite ? "on" : "off"}
                  onValueChange={(v) => onWatchOnWriteChange(v === "on")}
                >
                  <SelectTrigger
                    id="host-watch"
                    data-testid="host-watch"
                    aria-label={t("watchTitle")}
                    className="h-10 min-h-10"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">{t("watchOff")}</SelectItem>
                    <SelectItem value="on">{t("watchOn")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("watchHint")}
                </p>
              </div>
            </div>
            <SheetFooter>
              <Button
                data-testid="host-save"
                disabled={saveDisabled}
                onClick={onSave}
              >
                {t("save")}
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
