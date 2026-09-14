import { KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AiKey } from "@/api/ai";
import { aiItemGridClass, aiSparseCardClass } from "@/components/ai/aiLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

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
    <Card className={aiSparseCardClass(keys.length)} data-testid="ai-keys-card">
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
          <div className={aiItemGridClass(keys.length)} data-testid="ai-keys-grid">
            {keys.map((k) => (
              <Card key={k.id}>
                <CardContent className="p-4">
                  <div className="mb-2 break-all font-mono text-xs">{k.prefix}</div>
                  <div className="font-medium">{k.name}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {k.is_active ? t("colActive") : t("colInactive")}
                  </div>
                  {k.is_active ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full sm:w-auto"
                      onClick={() => onRevoke(k.id)}
                    >
                      {t("revoke")}
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
