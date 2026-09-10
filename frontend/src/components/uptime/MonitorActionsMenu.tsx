import { MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { UptimeMonitor } from "@/api/uptime";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type MonitorActionsMenuProps = {
  readonly monitor: UptimeMonitor;
  readonly historyTestId: "uptime-history" | "uptime-history-mobile";
  readonly onHistory: () => void;
  readonly onEdit: () => void;
  readonly onPause: () => void;
  readonly onDelete: () => void;
};

export function MonitorActionsMenu({
  monitor,
  historyTestId,
  onHistory,
  onEdit,
  onPause,
  onDelete,
}: MonitorActionsMenuProps) {
  const { t } = useTranslation("uptime");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0"
          data-testid="uptime-actions"
          aria-label={t("actionsMenu")}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem data-testid={historyTestId} onSelect={onHistory}>
          {t("history")}
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="uptime-edit" onSelect={onEdit}>
          {t("edit")}
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="uptime-pause" onSelect={onPause}>
          {monitor.enabled ? t("pause") : t("resume")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          data-testid="uptime-delete"
          onSelect={onDelete}
        >
          {t("delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
