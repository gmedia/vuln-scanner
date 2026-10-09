import { KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AiKey } from "@/api/ai";
import { formatAiTime } from "@/components/admin/aiFormat";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";

function statusLabel(t: (key: string) => string, isActive: boolean): string {
  return isActive ? t("colActive") : t("colInactive");
}

export function AiKeysPanel({
  keys,
  keyName,
  onKeyName,
  onceKey,
  createPending,
  onCreate,
  onRevoke,
  loading = false,
}: {
  readonly keys: readonly AiKey[];
  readonly keyName: string;
  readonly onKeyName: (v: string) => void;
  readonly onceKey: string | null;
  readonly createPending: boolean;
  readonly onCreate: () => void;
  readonly onRevoke: (id: string) => void;
  readonly loading?: boolean;
}) {
  const { t, i18n } = useTranslation("ai");
  return (
    <Card data-testid="ai-keys-card">
      <CardHeader className="gap-1">
        <CardDescription>{t("keysHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-muted/20 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="ai-key-name">{t("keyName")}</Label>
            <Input
              id="ai-key-name"
              className="h-10 min-h-10"
              value={keyName}
              onChange={(e) => onKeyName(e.target.value)}
            />
          </div>
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={onCreate}
            disabled={createPending}
          >
            {t("createKey")}
          </Button>
        </div>
        {onceKey ? (
          <Alert>
            <KeyRound className="text-muted-foreground" aria-hidden />
            <AlertDescription>
              <span className="text-foreground">{t("keyOnce")}:</span>{" "}
              <code className="break-all font-mono text-xs">{onceKey}</code>
            </AlertDescription>
          </Alert>
        ) : null}
        {loading ? (
          <TableRowSkeleton rows={5} columns={6} />
        ) : keys.length === 0 ? (
          <div className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-8 text-center">
            <KeyRound className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-foreground">{t("keysEmpty")}</p>
            <p className="text-xs text-muted-foreground">{t("keysEmptyHint")}</p>
          </div>
        ) : (
          <>
            <div className="space-y-2 md:hidden" data-testid="ai-keys-list-mobile">
              {keys.map((k) => (
                <div
                  key={k.id}
                  className="rounded-lg border border-border bg-card p-3"
                  data-testid={`ai-keys-card-${k.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-all font-mono text-xs text-foreground">
                      {k.prefix}
                    </p>
                    <Badge variant={k.is_active ? "success" : "failed"}>
                      {statusLabel(t, k.is_active)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm font-medium text-foreground">{k.name}</p>
                  <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {k.rate_limit_rpm} {t("colRpm")} ·{" "}
                    {k.last_used_at
                      ? formatAiTime(k.last_used_at, i18n.language)
                      : t("neverUsed")}
                  </p>
                  {k.is_active ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => onRevoke(k.id)}
                    >
                      {t("revoke")}
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            <div
              className="hidden overflow-x-auto md:block"
              data-testid="ai-keys-list-desktop"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] uppercase tracking-wider">
                      {t("colPrefix")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">
                      {t("colName")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">
                      {t("colActive")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">
                      {t("colRpm")}
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">
                      {t("colLastUsed")}
                    </TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider">
                      {t("revoke")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((k) => (
                    <TableRow key={k.id}>
                      <TableCell className="break-all font-mono text-xs">
                        {k.prefix}
                      </TableCell>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell>
                        <Badge variant={k.is_active ? "success" : "failed"}>
                          {statusLabel(t, k.is_active)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                        {k.rate_limit_rpm}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {k.last_used_at
                          ? formatAiTime(k.last_used_at, i18n.language)
                          : t("neverUsed")}
                      </TableCell>
                      <TableCell className="text-right">
                        {k.is_active ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onRevoke(k.id)}
                          >
                            {t("revoke")}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
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
