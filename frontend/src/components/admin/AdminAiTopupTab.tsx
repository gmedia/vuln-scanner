import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { topupAiWallet } from "@/api/admin";
import { AdminAiField } from "@/components/admin/AdminAiField";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

export function AdminAiTopupTab() {
  const { t } = useTranslation("admin");
  const [orgId, setOrgId] = useState("");
  const [amount, setAmount] = useState("10000");
  const topupMut = useMutation({
    mutationFn: () => topupAiWallet(orgId.trim(), Number(amount)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("aiTabTopup")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AdminAiField
            id="ai-org"
            label={t("aiOrgId")}
            value={orgId}
            onChange={setOrgId}
            placeholder={t("aiOrgIdPlaceholder")}
          />
          <AdminAiField id="ai-amt" label={t("aiAmount")} value={amount} onChange={setAmount} />
        </div>
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={() => topupMut.mutate()}
          disabled={topupMut.isPending}
        >
          {t("aiTopup")}
        </Button>
      </CardContent>
    </Card>
  );
}
