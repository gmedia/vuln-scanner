import type { GuardAgent } from "@/api/guard";
import { Button } from "@/components/ui/Button";
import { buttonVariants } from "@/components/ui/buttonVariants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { GuardTranslate } from "@/components/guard/guardFormat";

export function DisableAgentButton({
  agent,
  t,
  pending,
  onDisable,
}: {
  readonly agent: GuardAgent;
  readonly t: GuardTranslate;
  readonly pending: boolean;
  readonly onDisable: (id: string) => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-9 w-full text-destructive"
          disabled={pending}
          data-testid={`guard-disable-${agent.id}`}
          aria-label={t("disableAgentAria", { name: agent.name })}
        >
          {t("disableAgent")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("disableConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("disableConfirmBody")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            onClick={() => onDisable(agent.id)}
          >
            {t("disableSubmit")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function HostTokenIssueButton({
  agent,
  t,
  pending,
  onIssue,
}: {
  readonly agent: GuardAgent;
  readonly t: GuardTranslate;
  readonly pending: boolean;
  readonly onIssue: (id: string) => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-9 w-full"
          disabled={pending}
          data-testid="guard-host-token-issue"
          aria-label={
            agent.has_host_agent_token ? t("hostTokenRotate") : t("hostToken")
          }
        >
          {agent.has_host_agent_token ? t("hostTokenRotate") : t("hostToken")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("hostTokenConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("hostTokenConfirmBody")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => onIssue(agent.id)}>
            {t("hostTokenIssue")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
