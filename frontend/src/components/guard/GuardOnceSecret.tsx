import { SiemRail } from "@/components/siem/siemChrome";
import { Button } from "@/components/ui/Button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";
import type { GuardTranslate } from "@/components/guard/guardFormat";
import {
  GUARD_AGENT_INSTALL_INTRO,
  GUARD_AGENT_INSTALL_STEPS,
  GUARD_DISTRO_INSTALL_FOOTER,
  GUARD_DISTRO_INSTALL_GUIDES,
  GUARD_HOST_SETUP_STEPS,
} from "@/lib/guardEnrollHost";

export function GuardOnceSecret({
  rawToken,
  enrollCurl,
  curlCopied,
  onCopyCurl,
  t,
}: {
  readonly rawToken: string;
  readonly enrollCurl: string;
  readonly curlCopied: boolean;
  readonly onCopyCurl: () => void;
  readonly t: GuardTranslate;
}) {
  return (
    <div
      className="relative space-y-3 overflow-hidden rounded-lg border border-primary/40 bg-primary/5 p-3 pl-4 text-xs"
      data-testid="guard-host-enroll-steps"
    >
      <SiemRail className="bg-primary" />
      <div>
        <p className="mb-1 font-medium text-foreground">{t("saveNow")}</p>
        <code className="break-all font-mono text-[11px] leading-relaxed">
          {rawToken}
        </code>
      </div>
      <div>
        <p className="mb-1.5 font-medium text-foreground">{t("hostStepsTitle")}</p>
        <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground">
          {GUARD_HOST_SETUP_STEPS.map((step) => (
            <li key={step.slice(0, 32)}>{step}</li>
          ))}
        </ol>
      </div>
      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-foreground">{t("curlExample")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 text-xs"
            onClick={onCopyCurl}
          >
            {curlCopied ? t("copied") : t("copyCurl")}
          </Button>
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded border border-border/60 bg-background/80 p-2 font-mono text-[11px] leading-relaxed text-foreground">
          {enrollCurl}
        </pre>
        <p className="mt-2 text-muted-foreground">{t("curlHint")}</p>
      </div>
      <div data-testid="guard-agent-install-steps">
        <p className="mb-1.5 font-medium text-foreground">
          {t("agentInstallTitle")}
        </p>
        <p className="mb-2 text-muted-foreground">{GUARD_AGENT_INSTALL_INTRO}</p>
        <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground">
          {GUARD_AGENT_INSTALL_STEPS.map((step) => (
            <li key={step.slice(0, 36)}>{step}</li>
          ))}
        </ol>
        <div
          className="mt-3 space-y-2"
          data-testid="guard-distro-install-commands"
        >
          <p className="font-medium text-foreground">{t("distroCommands")}</p>
          <Accordion type="single" collapsible className="w-full space-y-2">
            {GUARD_DISTRO_INSTALL_GUIDES.map((guide) => (
              <AccordionItem
                key={guide.id}
                value={guide.id}
                className="rounded border border-border/60 bg-background/80 px-2 last:border-b"
              >
                <AccordionTrigger>
                  <span>
                    <span className="block font-medium text-foreground">
                      {guide.title}
                    </span>
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {guide.blurb}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-foreground">
                    {guide.commands.join("\n")}
                  </pre>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <p className="text-muted-foreground">{GUARD_DISTRO_INSTALL_FOOTER}</p>
        </div>
      </div>
    </div>
  );
}

export function GuardHostTokenOnce({
  token,
  agentId,
  copied,
  onCopy,
  t,
}: {
  readonly token: string;
  readonly agentId: string | null;
  readonly copied: boolean;
  readonly onCopy: () => void;
  readonly t: GuardTranslate;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 pl-4"
      data-testid="guard-host-token-once"
    >
      <SiemRail className="bg-primary" />
      <p className="pl-2 text-sm font-medium">{t("hostTokenSaveNow")}</p>
      {agentId ? (
        <p className="mt-1 pl-2 font-mono text-xs text-muted-foreground">
          --agent-id {agentId}
        </p>
      ) : null}
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded border border-border/60 bg-background p-2 font-mono text-[11px]">
        {token}
      </pre>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 min-h-9"
        aria-label={t("copyHostToken")}
        onClick={onCopy}
      >
        {copied ? t("hostTokenCopied") : t("copyHostToken")}
      </Button>
    </div>
  );
}
