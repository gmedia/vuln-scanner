import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import {
  BookOpen,
  Radar,
  Globe,
  Smartphone,
  CalendarClock,
  Shield,
  Siren,
  Users,
  Coins,
  LayoutDashboard,
  LogIn,
  ListOrdered,
  ChevronDown,
  Server,
  Activity,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { BRAND } from "@/lib/brand";
import {
  buildEnrollCurlExample,
  GUARD_AGENT_INSTALL_INTRO,
  GUARD_AGENT_INSTALL_STEPS,
  GUARD_DISTRO_INSTALL_FOOTER,
  GUARD_DISTRO_INSTALL_GUIDES,
  GUARD_HOST_SETUP_STEPS,
} from "@/lib/guardEnrollHost";

const TOC_IDS = [
  "mulai",
  "scan-ip",
  "scan-domain",
  "scan-mobile",
  "hasil",
  "jadwal",
  "aset",
  "workspace",
  "kredit",
  "guard",
  "siem",
  "uptime",
  "status-page",
  "tips",
] as const;

function SectionHeading({
  id,
  icon: Icon,
  title,
}: {
  id: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <h2
      id={id}
      className="mb-4 flex scroll-mt-24 items-center gap-2 text-xl font-semibold tracking-tight text-foreground"
    >
      <Icon className="h-5 w-5 shrink-0 text-primary" />
      {title}
    </h2>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return (
    <ol className="list-decimal space-y-2.5 pl-5 text-sm text-muted-foreground">
      {children}
    </ol>
  );
}

function Ui({ children }: { children?: ReactNode }) {
  return <strong className="font-medium text-foreground">{children}</strong>;
}

function GuideCode({ children }: { children?: ReactNode }) {
  return <code>{children}</code>;
}

const transUi = {
  ui: <Ui />,
  code: <GuideCode />,
};

function useActiveGuideSection() {
  const [activeId, setActiveId] = useState<string>(TOC_IDS[0]);

  useEffect(() => {
    const nodes = TOC_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (nodes.length === 0 || typeof IntersectionObserver === "undefined") {
      return;
    }

    const mainEl = nodes[0]?.closest("main");
    const mainOverflows =
      mainEl instanceof HTMLElement &&
      mainEl.scrollHeight > mainEl.clientHeight + 1;
    const scrollRoot = mainOverflows ? mainEl : null;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0]?.target.id;
        if (first) {
          setActiveId(first);
          return;
        }
        const readingY = 56 + 24;
        let bestId: string = TOC_IDS[0];
        let bestDist = Number.POSITIVE_INFINITY;
        for (const node of nodes) {
          const dist = Math.abs(node.getBoundingClientRect().top - readingY);
          if (dist < bestDist) {
            bestDist = dist;
            bestId = node.id;
          }
        }
        setActiveId(bestId);
      },
      {
        root: scrollRoot,
        rootMargin: "-56px 0px -50% 0px",
        threshold: [0, 0.1, 0.25],
      },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return activeId;
}

function GuideTocLinks({
  activeId,
  onNavigate,
  t,
}: {
  activeId: string;
  onNavigate?: () => void;
  t: (key: string) => string;
}) {
  return (
    <nav aria-label={t("tocAria")}>
      <ul className="space-y-0.5">
        {TOC_IDS.map((id) => {
          const isActive = id === activeId;
          return (
            <li key={id}>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className={cn(
                  "h-auto min-h-11 w-full justify-start whitespace-normal px-2.5 py-2 text-left font-normal",
                  "border-l-2",
                  isActive
                    ? "border-primary bg-muted font-medium text-foreground"
                    : "border-transparent",
                )}
              >
                <a
                  href={`#${id}`}
                  onClick={onNavigate}
                  aria-current={isActive ? "true" : undefined}
                >
                  {t(`toc.${id}`)}
                </a>
              </Button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function GuideDesktopToc({
  activeId,
  t,
}: {
  activeId: string;
  t: (key: string) => string;
}) {
  return (
    <nav aria-label={t("tocAria")}>
      <Sidebar
        collapsible="none"
        className="h-full w-full border-r bg-transparent"
      >
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="gap-2 text-xs font-medium uppercase tracking-wider">
              <ListOrdered className="h-3.5 w-3.5 text-primary" />
              {t("tocTitle")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {TOC_IDS.map((id) => (
                  <SidebarMenuItem key={id}>
                    <SidebarMenuButton
                      asChild
                      isActive={id === activeId}
                      className="h-auto min-h-8 whitespace-normal py-1.5 text-left leading-snug"
                    >
                      <a
                        href={`#${id}`}
                        aria-current={id === activeId ? "true" : undefined}
                      >
                        {t(`toc.${id}`)}
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </nav>
  );
}

function UserGuide() {
  const { t } = useTranslation("guide");
  const activeId = useActiveGuideSection();
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const activeLabel = t(`toc.${activeId}`);

  return (
    <div>
      <div className="mb-6 max-w-4xl 2xl:max-w-none">
        <div className="mb-1 flex items-center gap-2 text-primary">
          <BookOpen className="h-5 w-5" />
          <span className="text-xs font-medium uppercase tracking-wider">
            {t("kicker")}
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("intro", { product: BRAND.product })}
        </p>
      </div>

      <div className="sticky top-14 z-30 -mx-4 mb-6 bg-background px-4 py-2 md:-mx-6 md:px-6 lg:hidden">
        <Card>
          <CardHeader className="p-0">
            <Button
              type="button"
              variant="ghost"
              className="h-auto min-h-11 w-full items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-sm font-medium leading-none text-foreground hover:bg-transparent"
              aria-expanded={mobileTocOpen}
              onClick={() => setMobileTocOpen((open) => !open)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <ListOrdered className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate leading-none">
                  {t("tocTitle")}
                  <span className="ml-2 font-normal text-muted-foreground">
                    · {activeLabel}
                  </span>
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  mobileTocOpen && "rotate-180",
                )}
              />
            </Button>
          </CardHeader>
          <CardContent
            className={cn(
              "border-t border-border px-2 py-2",
              !mobileTocOpen && "hidden",
            )}
          >
            <GuideTocLinks
              activeId={activeId}
              onNavigate={() => setMobileTocOpen(false)}
              t={t}
            />
          </CardContent>
        </Card>
      </div>

      <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8 2xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside data-testid="guide-desktop-toc" className="hidden lg:block">
          <div className="sticky top-16 max-h-[calc(100svh-5rem)] overflow-y-auto overscroll-contain pr-1">
            <GuideDesktopToc activeId={activeId} t={t} />
          </div>
        </aside>

        <div className="min-w-0 space-y-8">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <SectionHeading id="mulai" icon={LogIn} title={t("hMulai")} />
              <Steps>
                <li>
                  <Trans i18nKey="mulai1" ns="guide" components={transUi} />
                </li>
                <li>
                  <Trans i18nKey="mulai2" ns="guide" components={transUi} />
                </li>
                <li>{t("mulai3")}</li>
                <li>
                  <Trans i18nKey="mulai4" ns="guide" components={transUi} />
                </li>
                <li>
                  <Trans
                    i18nKey="mulai5"
                    ns="guide"
                    components={{
                      dash: (
                        <Link
                          to="/dashboard"
                          className="text-primary hover:underline"
                        />
                      ),
                    }}
                  />
                </li>
              </Steps>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <SectionHeading id="scan-ip" icon={Radar} title={t("hScanIp")} />
              <Steps>
                <li>
                  <Trans
                    i18nKey="ip1"
                    ns="guide"
                    components={{
                      ...transUi,
                      ip: (
                        <Link
                          to="/scan/ip"
                          className="text-primary hover:underline"
                        />
                      ),
                    }}
                  />
                </li>
                <li>{t("ip2")}</li>
                <li>
                  <Trans i18nKey="ip3" ns="guide" components={transUi} />
                </li>
                <li>
                  <Trans i18nKey="ip4" ns="guide" components={transUi} />
                </li>
                <li>
                  <Trans i18nKey="ip5" ns="guide" components={transUi} />
                </li>
                <li>
                  <Trans
                    i18nKey="ip6"
                    ns="guide"
                    components={{
                      ...transUi,
                      hasil: (
                        <a
                          href="#hasil"
                          className="text-primary hover:underline"
                        />
                      ),
                    }}
                  />
                </li>
              </Steps>
              <p className="text-xs text-muted-foreground">{t("ipNote")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <SectionHeading
                id="scan-domain"
                icon={Globe}
                title={t("hScanDomain")}
              />
              <Steps>
                <li>
                  <Trans
                    i18nKey="dom1"
                    ns="guide"
                    components={{
                      dom: (
                        <Link
                          to="/scan/domain"
                          className="text-primary hover:underline"
                        />
                      ),
                    }}
                  />
                </li>
                <li>
                  <Trans i18nKey="dom2" ns="guide" components={transUi} />
                </li>
                <li>
                  <Trans i18nKey="dom3" ns="guide" components={transUi} />
                </li>
                <li>
                  <Trans i18nKey="dom4" ns="guide" components={transUi} />
                </li>
              </Steps>
              <p className="text-xs text-muted-foreground">{t("domNote")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <SectionHeading
                id="scan-mobile"
                icon={Smartphone}
                title={t("hScanMobile")}
              />
              <Steps>
                <li>
                  <Trans
                    i18nKey="mob1"
                    ns="guide"
                    components={{
                      ...transUi,
                      mob: (
                        <Link
                          to="/scan/mobile"
                          className="text-primary hover:underline"
                        />
                      ),
                    }}
                  />
                </li>
                <li>
                  <Trans i18nKey="mob2" ns="guide" components={transUi} />
                </li>
                <li>{t("mob3")}</li>
                <li>
                  <Trans i18nKey="mob4" ns="guide" components={transUi} />
                </li>
                <li>
                  <Trans i18nKey="mob5" ns="guide" components={transUi} />
                </li>
              </Steps>
              <p className="text-xs text-muted-foreground">{t("mobNote")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <SectionHeading
                id="hasil"
                icon={LayoutDashboard}
                title={t("hHasil")}
              />
              <Steps>
                <li>
                  <Trans i18nKey="res1" ns="guide" components={transUi} />
                </li>
                <li>{t("res2")}</li>
                <li>
                  {t("res3")}
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>
                      <Trans
                        i18nKey="resJson"
                        ns="guide"
                        components={transUi}
                      />
                    </li>
                    <li>
                      <Trans
                        i18nKey="resHtml"
                        ns="guide"
                        components={transUi}
                      />
                    </li>
                    <li>
                      <Trans
                        i18nKey="resExec"
                        ns="guide"
                        components={transUi}
                      />
                    </li>
                  </ul>
                </li>
                <li>
                  <Trans i18nKey="res4" ns="guide" components={transUi} />
                </li>
                <li>{t("res5")}</li>
              </Steps>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <SectionHeading
                id="jadwal"
                icon={CalendarClock}
                title={t("hJadwal")}
              />
              <p className="text-sm text-muted-foreground">
                <Trans i18nKey="jadIntro" ns="guide" components={transUi} />
              </p>
              <Steps>
                <li>
                  <Trans
                    i18nKey="jad1"
                    ns="guide"
                    components={{
                      ...transUi,
                      sch: (
                        <Link
                          to="/schedules"
                          className="text-primary hover:underline"
                        />
                      ),
                    }}
                  />
                </li>
                <li>
                  <Trans i18nKey="jad2" ns="guide" components={transUi} />
                </li>
                <li>
                  <Trans i18nKey="jad3" ns="guide" components={transUi} />
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>
                      <Trans
                        i18nKey="jadLabel"
                        ns="guide"
                        components={transUi}
                      />
                    </li>
                    <li>
                      <Trans
                        i18nKey="jadType"
                        ns="guide"
                        components={transUi}
                      />
                    </li>
                    <li>
                      <Trans
                        i18nKey="jadTarget"
                        ns="guide"
                        components={transUi}
                      />
                    </li>
                    <li>
                      <Trans
                        i18nKey="jadFreq"
                        ns="guide"
                        components={transUi}
                      />
                    </li>
                    <li>
                      <Trans
                        i18nKey="jadEmail"
                        ns="guide"
                        components={transUi}
                      />
                    </li>
                  </ul>
                </li>
                <li>
                  <Trans i18nKey="jad4" ns="guide" components={transUi} />
                </li>
                <li>
                  <Trans i18nKey="jad5" ns="guide" components={transUi} />
                </li>
                <li>{t("jad6")}</li>
              </Steps>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <SectionHeading id="aset" icon={Server} title={t("hAset")} />
              <p className="text-sm text-muted-foreground">{t("aIntro")}</p>
              <Steps>
                <li>
                  <Trans
                    i18nKey="a1"
                    ns="guide"
                    components={{
                      ...transUi,
                      as: (
                        <Link
                          to="/assets"
                          className="text-primary hover:underline"
                        />
                      ),
                    }}
                  />
                </li>
                <li>
                  <Trans i18nKey="a2" ns="guide" components={transUi} />
                </li>
                <li>
                  <Trans i18nKey="a3" ns="guide" components={transUi} />
                </li>
                <li>
                  <Trans i18nKey="a4" ns="guide" components={transUi} />
                </li>
              </Steps>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <SectionHeading
                id="workspace"
                icon={Users}
                title={t("hWorkspace")}
              />
              <Steps>
                <li>
                  <Trans
                    i18nKey="ws1"
                    ns="guide"
                    components={{
                      ws: (
                        <Link
                          to="/settings/workspace"
                          className="text-primary hover:underline"
                        />
                      ),
                    }}
                  />
                </li>
                <li>
                  <Trans i18nKey="ws2" ns="guide" components={transUi} />
                </li>
                <li>{t("ws3")}</li>
                <li>{t("ws4")}</li>
                <li>
                  <Trans i18nKey="ws5" ns="guide" components={transUi} />
                </li>
                <li>
                  <Trans i18nKey="ws6" ns="guide" components={transUi} />
                </li>
              </Steps>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <SectionHeading id="kredit" icon={Coins} title={t("hKredit")} />
              <Steps>
                <li>{t("cr1")}</li>
                <li>{t("cr2")}</li>
                <li>
                  <Trans
                    i18nKey="cr3"
                    ns="guide"
                    components={{
                      ch: (
                        <Link
                          to="/credit-history"
                          className="text-primary hover:underline"
                        />
                      ),
                    }}
                  />
                </li>
                <li>{t("cr4")}</li>
                <li>
                  <Trans i18nKey="cr5" ns="guide" components={transUi} />
                </li>
              </Steps>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <SectionHeading id="guard" icon={Shield} title={t("hGuard")} />
              <p className="text-sm text-muted-foreground">{t("gIntro")}</p>
              <Steps>
                <li>
                  <Trans
                    i18nKey="g1"
                    ns="guide"
                    components={{
                      g: (
                        <Link
                          to="/guard"
                          className="text-primary hover:underline"
                        />
                      ),
                    }}
                  />
                </li>
                <li>
                  <Trans i18nKey="g2" ns="guide" components={transUi} />
                </li>
                <li>
                  <Trans i18nKey="g3" ns="guide" components={transUi} />
                </li>
                <li>
                  {t("gHostLead")}
                  <ul className="mt-2 list-disc space-y-1.5 pl-5">
                    {GUARD_HOST_SETUP_STEPS.map((step) => (
                      <li key={step.slice(0, 40)}>{step}</li>
                    ))}
                  </ul>
                </li>
                <li>
                  {t("gCurlLead")}
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                    {buildEnrollCurlExample(
                      "https://<APP_ORIGIN>",
                      "<ENROLL_TOKEN>",
                      "<AGENT_NAME>",
                    )}
                  </pre>
                  <Trans i18nKey="gEndpoint" ns="guide" components={transUi} />
                </li>
                <li>
                  {t("gInstallLead")}
                  <p className="mt-2 text-sm text-muted-foreground">
                    {GUARD_AGENT_INSTALL_INTRO}
                  </p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5">
                    {GUARD_AGENT_INSTALL_STEPS.map((step) => (
                      <li key={step.slice(0, 40)}>{step}</li>
                    ))}
                  </ul>
                  <div
                    className="mt-3 space-y-2"
                    data-testid="guard-distro-install-commands"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {t("gHostCmds")}
                    </p>
                    <Accordion
                      type="single"
                      collapsible
                      className="w-full space-y-2"
                    >
                      {GUARD_DISTRO_INSTALL_GUIDES.map((guide) => (
                        <AccordionItem
                          key={guide.id}
                          value={guide.id}
                          className="rounded-md border border-border bg-muted/30 px-3 last:border-b"
                        >
                          <AccordionTrigger>
                            <span>
                              <span className="block text-sm font-medium text-foreground">
                                {guide.title}
                              </span>
                              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                                {guide.blurb}
                              </span>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent forceMount>
                            <pre className="mb-1 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-background/80 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                              {guide.commands.join("\n")}
                            </pre>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                    <p className="text-xs text-muted-foreground">
                      {GUARD_DISTRO_INSTALL_FOOTER}
                    </p>
                  </div>
                </li>
                <li>
                  <Trans i18nKey="g7" ns="guide" components={transUi} />
                </li>
                <li>{t("g8")}</li>
                <li>
                  <Trans i18nKey="g9" ns="guide" components={transUi} />
                </li>
              </Steps>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <SectionHeading id="siem" icon={Siren} title={t("hSiem")} />
              <p className="text-sm text-muted-foreground">
                <Trans i18nKey="sIntro" ns="guide" components={transUi} />
              </p>
              <Steps>
                <li>
                  <Trans
                    i18nKey="s1"
                    ns="guide"
                    components={{
                      g: (
                        <Link
                          to="/guard"
                          className="text-primary hover:underline"
                        />
                      ),
                    }}
                  />
                </li>
                <li>
                  <Trans
                    i18nKey="s2"
                    ns="guide"
                    components={{
                      ...transUi,
                      siem: (
                        <Link
                          to="/siem"
                          className="text-primary hover:underline"
                        />
                      ),
                    }}
                  />
                </li>
                <li>
                  <Trans i18nKey="s3" ns="guide" components={transUi} />
                </li>
                <li>
                  <Trans i18nKey="s4" ns="guide" components={transUi} />
                </li>
              </Steps>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <SectionHeading id="uptime" icon={Activity} title={t("hUptime")} />
              <p className="text-sm text-muted-foreground">
                <Trans i18nKey="uIntro" ns="guide" components={transUi} />
              </p>
              <Steps>
                <li>
                  <Trans
                    i18nKey="u1"
                    ns="guide"
                    components={{
                      ...transUi,
                      up: (
                        <Link
                          to="/uptime"
                          className="text-primary hover:underline"
                        />
                      ),
                    }}
                  />
                </li>
                <li>
                  <Trans i18nKey="u2" ns="guide" components={transUi} />
                </li>
                <li>
                  <Trans i18nKey="u3" ns="guide" components={transUi} />
                </li>
                <li>{t("u4")}</li>
              </Steps>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <SectionHeading
                id="status-page"
                icon={FileText}
                title={t("hStatus")}
              />
              <p className="text-sm text-muted-foreground">
                <Trans i18nKey="spIntro" ns="guide" components={transUi} />
              </p>
              <Steps>
                <li>{t("sp1")}</li>
                <li>
                  <Trans
                    i18nKey="sp2"
                    ns="guide"
                    components={{
                      ...transUi,
                      sp: (
                        <Link
                          to="/uptime/status-page"
                          className="text-primary hover:underline"
                        />
                      ),
                    }}
                  />
                </li>
                <li>
                  <Trans i18nKey="sp3" ns="guide" components={transUi} />
                </li>
                <li>
                  <Trans i18nKey="sp4" ns="guide" components={transUi} />
                </li>
                <li>
                  <Trans i18nKey="sp5" ns="guide" components={transUi} />
                </li>
              </Steps>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <SectionHeading id="tips" icon={BookOpen} title={t("hTips")} />
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>{t("t1")}</li>
                <li>{t("t2")}</li>
                <li>{t("t3")}</li>
                <li>{t("t4", { name: BRAND.name, product: BRAND.product })}</li>
                <li>
                  <Trans
                    i18nKey="t5"
                    ns="guide"
                    components={{
                      guide: (
                        <Link
                          to="/guide"
                          className="text-primary hover:underline"
                        />
                      ),
                    }}
                  />
                </li>
              </ol>
              <p className="pt-2 text-xs text-muted-foreground">
                {BRAND.footerLine}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default UserGuide;
