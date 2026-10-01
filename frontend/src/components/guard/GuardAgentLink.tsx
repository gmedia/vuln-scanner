import { Link } from "react-router-dom";
import type { ScanAsset } from "@/api/assets";
import type { GuardAgent } from "@/api/guard";
import type { GuardTranslate } from "@/components/guard/guardFormat";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";

export function GuardAssetChip({
  agent,
  t,
}: {
  readonly agent: GuardAgent;
  readonly t: GuardTranslate;
}) {
  if (!agent.asset_id) return null;
  return (
    <>
      <Badge variant="info" data-testid={`guard-asset-chip-${agent.id}`}>
        {t("linkedAsset", { name: agent.asset_name ?? agent.asset_id })}
      </Badge>
      <Button variant="link" size="sm" className="h-auto justify-start p-0" asChild>
        <Link to="/assets">{t("openAssets")}</Link>
      </Button>
    </>
  );
}

export function GuardAssetSelect({
  agent,
  assets,
  labeled,
  onLink,
  t,
}: {
  readonly agent: GuardAgent;
  readonly assets: readonly ScanAsset[];
  readonly labeled: boolean;
  readonly onLink: (agentId: string, assetId: string | null) => void;
  readonly t: GuardTranslate;
}) {
  return (
    <>
      {labeled ? (
        <Label htmlFor={`guard-link-${agent.id}`} className="sr-only">
          {t("linkAsset")}
        </Label>
      ) : null}
      <Select
        value={agent.asset_id ?? "none"}
        onValueChange={(v) =>
          onLink(agent.id, v === "none" ? null : v)
        }
      >
        <SelectTrigger
          id={labeled ? `guard-link-${agent.id}` : undefined}
          className="h-10"
          data-testid={`guard-link-asset-${agent.id}`}
          aria-label={labeled ? undefined : t("linkAsset")}
        >
          <SelectValue placeholder={t("linkAsset")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("unlinkAsset")}</SelectItem>
          {assets.map((asset) => (
            <SelectItem key={asset.id} value={asset.id}>
              {asset.name} ({asset.target})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
