import { useState } from "react";
import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";
import PageHeader from "@/components/layout/PageHeader";
import {
  GuideChapter,
  GuideIntro,
  GuideNote,
  GuidePre,
  Steps,
} from "@/components/guide/GuideChapter";
import { transUi } from "@/components/guide/guideTrans";
import { GuideJumpMap } from "@/components/guide/GuideJumpMap";
import { GuideDesktopToc, GuideMobileToc } from "@/components/guide/GuideToc";
import { ICON_BY_ID } from "@/components/guide/guideMeta";
import { useActiveGuideSection } from "@/components/guide/useActiveGuideSection";
import { BRAND } from "@/lib/brand";
import {
  buildEnrollCurlExample,
  GUARD_AGENT_INSTALL_INTRO,
  GUARD_AGENT_INSTALL_STEPS,
  GUARD_DISTRO_INSTALL_FOOTER,
  GUARD_DISTRO_INSTALL_GUIDES,
  GUARD_HOST_SETUP_STEPS,
} from "@/lib/guardEnrollHost";
import {
  SINEXIS_INSTALL_RAW_URL,
  SINEXIS_INSTALL_WGET,
} from "@/lib/sinexisInstall";

function UserGuide() {
  const { t } = useTranslation("guide");
  const activeId = useActiveGuideSection();
  const [mobileTocOpen, setMobileTocOpen] = useState(false);

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title={t("title")}
        description={
          <div className="space-y-1">
            <p>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("kicker")}
              </span>
              <span className="mx-2 text-border">·</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {t("moduleCount", { count: 15 })}
              </span>
            </p>
            <p>{t("intro", { product: BRAND.product })}</p>
          </div>
        }
      />
      <GuideJumpMap activeId={activeId} t={t} />

      <GuideMobileToc
        activeId={activeId}
        mobileTocOpen={mobileTocOpen}
        onToggle={() => setMobileTocOpen((open) => !open)}
        onNavigate={() => setMobileTocOpen(false)}
        t={t}
      />

      <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8 2xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside data-testid="guide-desktop-toc" className="hidden lg:block">
          <div className="sticky top-6 max-h-[calc(100svh-5rem)] overflow-y-auto overscroll-contain pr-1">
            <GuideDesktopToc activeId={activeId} t={t} />
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          <GuideChapter id="mulai" icon={ICON_BY_ID.mulai} title={t("hMulai")}>
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
          </GuideChapter>

          <GuideChapter
            id="scan-ip"
            icon={ICON_BY_ID["scan-ip"]}
            title={t("hScanIp")}
          >
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
            <GuideNote>{t("ipNote")}</GuideNote>
          </GuideChapter>

          <GuideChapter
            id="scan-domain"
            icon={ICON_BY_ID["scan-domain"]}
            title={t("hScanDomain")}
          >
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
            <GuideNote>{t("domNote")}</GuideNote>
          </GuideChapter>

          <GuideChapter
            id="scan-mobile"
            icon={ICON_BY_ID["scan-mobile"]}
            title={t("hScanMobile")}
          >
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
            <GuideNote>{t("mobNote")}</GuideNote>
          </GuideChapter>

          <GuideChapter
            id="hasil"
            icon={ICON_BY_ID.hasil}
            title={t("hHasil")}
          >
            <Steps>
              <li>
                <Trans i18nKey="res1" ns="guide" components={transUi} />
              </li>
              <li>{t("res2")}</li>
              <li>
                {t("res3")}
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    <Trans i18nKey="resJson" ns="guide" components={transUi} />
                  </li>
                  <li>
                    <Trans i18nKey="resHtml" ns="guide" components={transUi} />
                  </li>
                  <li>
                    <Trans i18nKey="resExec" ns="guide" components={transUi} />
                  </li>
                </ul>
              </li>
              <li>
                <Trans i18nKey="res4" ns="guide" components={transUi} />
              </li>
              <li>{t("res5")}</li>
            </Steps>
          </GuideChapter>

          <GuideChapter
            id="jadwal"
            icon={ICON_BY_ID.jadwal}
            title={t("hJadwal")}
          >
            <GuideIntro>
              <Trans i18nKey="jadIntro" ns="guide" components={transUi} />
            </GuideIntro>
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
                    <Trans i18nKey="jadLabel" ns="guide" components={transUi} />
                  </li>
                  <li>
                    <Trans i18nKey="jadType" ns="guide" components={transUi} />
                  </li>
                  <li>
                    <Trans i18nKey="jadTarget" ns="guide" components={transUi} />
                  </li>
                  <li>
                    <Trans i18nKey="jadFreq" ns="guide" components={transUi} />
                  </li>
                  <li>
                    <Trans i18nKey="jadEmail" ns="guide" components={transUi} />
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
          </GuideChapter>

          <GuideChapter id="aset" icon={ICON_BY_ID.aset} title={t("hAset")}>
            <GuideIntro>{t("aIntro")}</GuideIntro>
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
          </GuideChapter>

          <GuideChapter
            id="workspace"
            icon={ICON_BY_ID.workspace}
            title={t("hWorkspace")}
          >
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
          </GuideChapter>

          <GuideChapter
            id="kredit"
            icon={ICON_BY_ID.kredit}
            title={t("hKredit")}
          >
            <Steps>
              <li>{t("cr1")}</li>
              <li>{t("cr2")}</li>
              <li>{t("cr3")}</li>
              <li>{t("cr4")}</li>
              <li>
                <Trans i18nKey="cr5" ns="guide" components={transUi} />
              </li>
            </Steps>
          </GuideChapter>

          <GuideChapter
            id="guard"
            icon={ICON_BY_ID.guard}
            title={t("hGuard")}
            tone="runtime"
          >
            <GuideIntro>{t("gIntro")}</GuideIntro>
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
                <GuidePre>
                  {buildEnrollCurlExample(
                    "https://<APP_ORIGIN>",
                    "<ENROLL_TOKEN>",
                    "<AGENT_NAME>",
                  )}
                </GuidePre>
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
                        <AccordionContent>
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
          </GuideChapter>

          <GuideChapter
            id="siem"
            icon={ICON_BY_ID.siem}
            title={t("hSiem")}
            tone="runtime"
          >
            <GuideIntro>
              <Trans i18nKey="sIntro" ns="guide" components={transUi} />
            </GuideIntro>
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
              <li>
                <Trans i18nKey="sCasesWhat" ns="guide" components={transUi} />
              </li>
              <li>
                <Trans i18nKey="sCasesVs" ns="guide" components={transUi} />
              </li>
              <li>
                <Trans i18nKey="sCasesFlow" ns="guide" components={transUi} />
              </li>
              <li>
                <Trans i18nKey="sCasesNot" ns="guide" components={transUi} />
              </li>
            </Steps>
          </GuideChapter>

          <GuideChapter
            id="uptime"
            icon={ICON_BY_ID.uptime}
            title={t("hUptime")}
            tone="runtime"
          >
            <GuideIntro>
              <Trans i18nKey="uIntro" ns="guide" components={transUi} />
            </GuideIntro>
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
          </GuideChapter>

          <GuideChapter
            id="status-page"
            icon={ICON_BY_ID["status-page"]}
            title={t("hStatus")}
            tone="runtime"
          >
            <GuideIntro>
              <Trans i18nKey="spIntro" ns="guide" components={transUi} />
            </GuideIntro>
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
          </GuideChapter>

          <GuideChapter
            id="host"
            icon={ICON_BY_ID.host}
            title={t("hHost")}
            tone="runtime"
          >
            <GuideIntro>
              <Trans i18nKey="hpIntro" ns="guide" components={transUi} />
            </GuideIntro>
            <Steps>
              <li>
                <Trans
                  i18nKey="hp1"
                  ns="guide"
                  components={{
                    ...transUi,
                    guard: (
                      <a
                        href="#guard"
                        className="text-primary hover:underline"
                      />
                    ),
                    host: (
                      <Link
                        to="/host"
                        className="text-primary hover:underline"
                      />
                    ),
                  }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="hpGet"
                  ns="guide"
                  components={{
                    ...transUi,
                    gh: (
                      <a
                        href={SINEXIS_INSTALL_RAW_URL}
                        className="text-primary hover:underline"
                        download="sinexis-install.sh"
                        rel="noreferrer"
                      />
                    ),
                    rel: (
                      <a
                        href="https://github.com/gmedia/vuln-scanner/releases"
                        className="text-primary hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      />
                    ),
                  }}
                />
                <GuidePre testId="sinexis-install-wget">
                  {SINEXIS_INSTALL_WGET}
                </GuidePre>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("hpGetCheck")}
                </p>
              </li>
              <li>
                <Trans i18nKey="hpInstall" ns="guide" components={transUi} />
              </li>
              <li>
                <Trans i18nKey="hp2" ns="guide" components={transUi} />
              </li>
              <li>{t("hp3")}</li>
              <li>
                <Trans i18nKey="hp4" ns="guide" components={transUi} />
              </li>
              <li>
                <Trans i18nKey="hp5" ns="guide" components={transUi} />
              </li>
              <li>
                <Trans i18nKey="hp5b" ns="guide" components={transUi} />
              </li>
              <li>
                <Trans i18nKey="hp5c" ns="guide" components={transUi} />
              </li>
            </Steps>
          </GuideChapter>

          <GuideChapter
            id="tips"
            icon={ICON_BY_ID.tips}
            title={t("hTips")}
            tone="limits"
          >
            <Steps>
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
            </Steps>
            <p className="pt-2 text-xs text-muted-foreground">
              {BRAND.footerLine}
            </p>
          </GuideChapter>
        </div>
      </div>
    </div>
  );
}

export default UserGuide;
