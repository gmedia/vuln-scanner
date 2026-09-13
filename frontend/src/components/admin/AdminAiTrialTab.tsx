import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { adminAiChat, type AiModelAdmin, type AiProviderAdmin } from "@/api/admin";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";

export function AdminAiTrialTab({
  providers,
  models,
}: {
  readonly providers: readonly AiProviderAdmin[];
  readonly models: readonly AiModelAdmin[];
}) {
  const { t } = useTranslation("admin");
  const [providerId, setProviderId] = useState("");
  const [trialModel, setTrialModel] = useState("");
  const [trialPrompt, setTrialPrompt] = useState("ping");
  const [trialReply, setTrialReply] = useState("");
  const chatMut = useMutation({
    mutationFn: () =>
      adminAiChat({
        model: trialModel,
        messages: [{ role: "user", content: trialPrompt }],
        max_tokens: 64,
      }),
    onSuccess: (data) => {
      const choices = data.choices as { message?: { content?: string } }[] | undefined;
      setTrialReply(choices?.[0]?.message?.content ?? JSON.stringify(data));
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("aiTabTrial")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="ai-trial-provider">{t("aiProviderId")}</Label>
            <Select
              value={providerId || undefined}
              onValueChange={(v) => {
                setProviderId(v);
                setTrialModel("");
              }}
            >
              <SelectTrigger id="ai-trial-provider" className="h-10 min-h-10">
                <SelectValue placeholder={t("aiSelectProvider")} />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="ai-tm">{t("aiTrialModel")}</Label>
            <Select
              value={trialModel || undefined}
              onValueChange={setTrialModel}
              disabled={!providerId}
            >
              <SelectTrigger id="ai-tm" className="h-10 min-h-10">
                <SelectValue placeholder={t("aiSelectModel")} />
              </SelectTrigger>
              <SelectContent>
                {models
                  .filter((m) => m.provider_id === providerId)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.public_id}>
                      {m.public_id}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="ai-tp">{t("aiTrialPrompt")}</Label>
          <Textarea
            id="ai-tp"
            value={trialPrompt}
            onChange={(e) => setTrialPrompt(e.target.value)}
          />
        </div>
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={() => chatMut.mutate()}
          disabled={chatMut.isPending || !trialModel}
        >
          {t("aiTrialSend")}
        </Button>
        {trialReply ? (
          <p className="whitespace-pre-wrap break-words text-sm">
            {t("aiTrialReply")}: {trialReply}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
