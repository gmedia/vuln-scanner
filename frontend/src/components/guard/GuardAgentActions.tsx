import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export function GuardAgentCommandsMenu({
  agent,
  t,
  hostTokenPending,
  disablePending,
  onIssue,
  onDisable,
}: {
  readonly agent: GuardAgent;
  readonly t: GuardTranslate;
  readonly hostTokenPending: boolean;
  readonly disablePending: boolean;
  readonly onIssue: (id: string) => void;
  readonly onDisable: (id: string) => void;
}) {
  const [mode, setMode] = useState<"token" | "disable" | null>(null);
  const pending = mode === "disable" ? disablePending : hostTokenPending;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0"
            data-testid={`guard-agent-actions-${agent.id}`}
            aria-label={t("actionsMenu")}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            data-testid={`guard-agent-token-${agent.id}`}
            onSelect={() => setMode("token")}
          >
            {agent.has_host_agent_token ? t("hostTokenRotate") : t("hostToken")}
          </DropdownMenuItem>
          {!agent.disabled ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                data-testid={`guard-agent-disable-${agent.id}`}
                onSelect={() => setMode("disable")}
              >
                {t("disableAgent")}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        open={mode !== null}
        onOpenChange={(open) => {
          if (!open) setMode(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {mode === "disable"
                ? t("disableConfirmTitle")
                : t("hostTokenConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {mode === "disable"
                ? t("disableConfirmBody")
                : t("hostTokenConfirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={
                mode === "disable"
                  ? buttonVariants({ variant: "destructive" })
                  : undefined
              }
              data-testid={
                mode === "disable"
                  ? `guard-agent-disable-confirm-${agent.id}`
                  : `guard-agent-token-confirm-${agent.id}`
              }
              disabled={pending}
              onClick={() => {
                if (mode === "disable") {
                  onDisable(agent.id);
                } else {
                  onIssue(agent.id);
                }
                setMode(null);
              }}
            >
              {mode === "disable" ? t("disableSubmit") : t("hostTokenIssue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
