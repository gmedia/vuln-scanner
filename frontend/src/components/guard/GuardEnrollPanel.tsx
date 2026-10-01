import type { GuardEnrollTokenMeta } from "@/api/guard";
import { GuardOnceSecret } from "@/components/guard/GuardOnceSecret";
import { GuardTokenList } from "@/components/guard/GuardTokenList";
import type { GuardTranslate } from "@/components/guard/guardFormat";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

export function GuardEnrollPanel({
  tokenLabel,
  onLabelChange,
  createPending,
  onCreate,
  rawToken,
  enrollCurl,
  curlCopied,
  onCopyCurl,
  loading,
  tokens,
  visibleTokens,
  tokenExpired,
  nowMs,
  dateLocale,
  showAllTokens,
  unusedCount,
  revokePending,
  onToggleMore,
  onRevoke,
  t,
}: {
  readonly tokenLabel: string;
  readonly onLabelChange: (value: string) => void;
  readonly createPending: boolean;
  readonly onCreate: () => void;
  readonly rawToken: string | null;
  readonly enrollCurl: string;
  readonly curlCopied: boolean;
  readonly onCopyCurl: () => void;
  readonly loading: boolean;
  readonly tokens: readonly GuardEnrollTokenMeta[];
  readonly visibleTokens: readonly GuardEnrollTokenMeta[];
  readonly tokenExpired: (tok: GuardEnrollTokenMeta) => boolean;
  readonly nowMs: number;
  readonly dateLocale: string;
  readonly showAllTokens: boolean;
  readonly unusedCount: number;
  readonly revokePending: boolean;
  readonly onToggleMore: () => void;
  readonly onRevoke: (id: string) => void;
  readonly t: GuardTranslate;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold tracking-wide">{t("enrollTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("enrollDescription")}
        </p>
      </div>
      <div className="space-y-4 p-4">
        <div className="flex max-w-xl flex-col gap-2 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="enroll-label">{t("labelOptional")}</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                id="enroll-label"
                value={tokenLabel}
                onChange={(e) => onLabelChange(e.target.value)}
                placeholder="vps-colo-1"
                className="h-10"
              />
              <Button
                className="shrink-0"
                onClick={onCreate}
                disabled={createPending}
              >
                {t("createToken")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("labelHint")}</p>
          </div>
        </div>
        {rawToken ? (
          <GuardOnceSecret
            rawToken={rawToken}
            enrollCurl={enrollCurl}
            curlCopied={curlCopied}
            onCopyCurl={onCopyCurl}
            t={t}
          />
        ) : null}
        <GuardTokenList
          loading={loading}
          tokens={tokens}
          visibleTokens={visibleTokens}
          tokenExpired={tokenExpired}
          nowMs={nowMs}
          dateLocale={dateLocale}
          showAllTokens={showAllTokens}
          unusedCount={unusedCount}
          revokePending={revokePending}
          onToggleMore={onToggleMore}
          onRevoke={onRevoke}
          t={t}
        />
      </div>
    </section>
  );
}
