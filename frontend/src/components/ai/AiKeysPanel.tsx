import { KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AiKey } from "@/api/ai";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
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
}: {
  readonly keys: readonly AiKey[];
  readonly keyName: string;
  readonly onKeyName: (v: string) => void;
  readonly onceKey: string | null;
  readonly createPending: boolean;
  readonly onCreate: () => void;
  readonly onRevoke: (id: string) => void;
}) {
  const { t } = useTranslation("ai");
  return (
    <Card data-testid="ai-keys-card">
      <CardHeader>
        <CardTitle>{t("tabKeys")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="ai-key-name">{t("keyName")}</Label>
          <Input
            id="ai-key-name"
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
        {onceKey ? (
          <Alert>
            <AlertDescription>
              {t("keyOnce")}: <code className="break-all">{onceKey}</code>
            </AlertDescription>
          </Alert>
        ) : null}
        {keys.length === 0 ? (
          <div className="flex min-h-[8rem] flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <KeyRound className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">{t("keysEmpty")}</p>
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
                  <p className="min-w-0 break-all font-mono text-xs text-foreground">
                    {k.prefix}
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">{k.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {statusLabel(t, k.is_active)}
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
                    <TableHead>{t("colPrefix")}</TableHead>
                    <TableHead>{t("colName")}</TableHead>
                    <TableHead>{t("colActive")}</TableHead>
                    <TableHead className="text-right">{t("revoke")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((k) => (
                    <TableRow key={k.id}>
                      <TableCell className="break-all font-mono text-xs">
                        {k.prefix}
                      </TableCell>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {statusLabel(t, k.is_active)}
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
