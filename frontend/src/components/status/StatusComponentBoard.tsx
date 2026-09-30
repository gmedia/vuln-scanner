import { Activity, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { StatusComponent } from "@/api/statusPage";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { componentStateBadge } from "@/components/status/statusChrome";
import { cn } from "@/lib/utils";

export function StatusComponentBoard({
  components,
  removing,
  onRemove,
}: {
  readonly components: readonly StatusComponent[];
  readonly removing: boolean;
  readonly onRemove: (id: string) => void;
}) {
  const { t } = useTranslation("statusPage");
  const unknown = t("stateUnknown");

  if (components.length === 0) {
    return (
      <div className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-8 text-center">
        <Activity className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">{t("noComponents")}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[10px] uppercase tracking-wider">
              {t("displayName")}
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">
              {t("status")}
            </TableHead>
            <TableHead className="text-right text-[10px] uppercase tracking-wider">
              {t("colActions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {components.map((c) => (
            <TableRow
              key={c.id}
              className={cn(
                "h-12 hover:bg-muted/50",
                c.state === "down" && "bg-destructive/[0.04]",
              )}
            >
              <TableCell className="font-medium">{c.display_name}</TableCell>
              <TableCell>
                <Badge variant={componentStateBadge(c.state)}>
                  {c.state ?? unknown}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 w-11 min-h-11 min-w-11 p-0 md:h-9 md:w-9 md:min-h-9 md:min-w-9"
                  data-testid={`status-component-remove-${c.id}`}
                  aria-label={t("remove")}
                  disabled={removing}
                  onClick={() => onRemove(c.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
