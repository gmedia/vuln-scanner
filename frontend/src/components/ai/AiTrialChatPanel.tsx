import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { aiTrialChat, type AiPublicModel } from "@/api/ai";
import { apiErrorMessage } from "@/api/apiErrors";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

interface TrialUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

function replyContent(payload: Record<string, unknown>): string {
  const choices = payload.choices as
    | { message?: { content?: string } }[]
    | undefined;
  return choices?.[0]?.message?.content ?? JSON.stringify(payload);
}

export function AiTrialChatPanel({
  models,
  loading = false,
}: {
  readonly models: readonly AiPublicModel[];
  readonly loading?: boolean;
}) {
  const { t } = useTranslation("ai");
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("ping");
  const [reply, setReply] = useState("");
  const [usage, setUsage] = useState<TrialUsage | null>(null);
  // form-feedback: allow inline isError alert renders apiErrorMessage below.
  const chatMut = useMutation({
    mutationFn: () =>
      aiTrialChat({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 256,
      }),
    onSuccess: (data) => {
      setReply(replyContent(data));
      const raw = data.usage;
      setUsage(raw && typeof raw === "object" ? (raw as TrialUsage) : null);
    },
    onError: () => {
      setReply("");
      setUsage(null);
    },
  });

  return (
    <Card data-testid="ai-trial-card">
      <CardHeader className="gap-1">
        <CardDescription>{t("trialHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="ai-trial-model">{t("trialModel")}</Label>
          <Select
            value={model || undefined}
            onValueChange={setModel}
            disabled={loading || models.length === 0}
          >
            <SelectTrigger id="ai-trial-model" className="h-10 min-h-10">
              <SelectValue placeholder={t("trialSelectModel")} />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.public_id} value={m.public_id}>
                  {m.public_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="ai-trial-prompt">{t("trialPrompt")}</Label>
          <Textarea
            id="ai-trial-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={() => chatMut.mutate()}
          disabled={chatMut.isPending || !model || prompt.trim().length === 0}
        >
          <MessageSquare className="mr-1.5 h-4 w-4" aria-hidden />
          {t("trialSend")}
        </Button>
        {reply ? (
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              {t("trialReply")}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
              {reply}
            </p>
            {usage ? (
              <p className="mt-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                {t("trialUsage", {
                  in: usage.prompt_tokens ?? 0,
                  out: usage.completion_tokens ?? 0,
                  cache: usage.prompt_tokens_details?.cached_tokens ?? 0,
                })}
              </p>
            ) : null}
          </div>
        ) : null}
        {chatMut.isError ? (
          <p
            data-testid="ai-trial-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {apiErrorMessage(chatMut.error, t("trialError"))}
            {isAxiosError(chatMut.error) && chatMut.error.response?.status
              ? ` (${chatMut.error.response.status})`
              : null}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
