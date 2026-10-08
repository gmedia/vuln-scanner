import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { topupAiWallet } from "@/api/admin";
import { Wallet } from "lucide-react";
import { AdminAiField } from "@/components/admin/AdminAiField";
import { Button } from "@/components/ui/Button";
import {
  AdminShell,
  AdminShellBody,
  AdminShellHead,
} from "@/components/admin/AdminShell";

export function AdminAiTopupTab() {
  const { t } = useTranslation("admin");
  const [orgId, setOrgId] = useState("");
  const [amount, setAmount] = useState("10000");
  const topupMut = useMutation({
    mutationFn: () => topupAiWallet(orgId.trim(), Number(amount)),
  });
  return (
    <AdminShell tone="primary">
      <AdminShellHead icon={Wallet} title={t("aiTabTopup")} />
      <AdminShellBody className="space-y-4">
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
      </AdminShellBody>
    </AdminShell>
  );
}
