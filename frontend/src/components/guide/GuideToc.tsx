import { ChevronDown, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/Button";
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
import { cn } from "@/lib/utils";
import { GUIDE_GROUPS, type TocId } from "@/components/guide/guideMeta";

type GuideT = (key: string) => string;

function GuideTocLinks({
  activeId,
  onNavigate,
  t,
}: {
  activeId: TocId;
  onNavigate?: () => void;
  t: GuideT;
}) {
  return (
    <nav aria-label={t("tocAria")}>
      <div className="space-y-3">
        {GUIDE_GROUPS.map((group) => (
          <div key={group.id}>
            <p className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t(`groups.${group.id}`)}
            </p>
            <ul className="space-y-0.5">
              {group.ids.map((id) => {
                const isActive = id === activeId;
                return (
                  <li key={id}>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-auto min-h-11 w-full justify-start whitespace-normal rounded-md px-2.5 py-2 text-left font-normal",
                        isActive && "bg-muted font-medium text-foreground",
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
          </div>
        ))}
      </div>
    </nav>
  );
}

export function GuideMobileToc({
  activeId,
  mobileTocOpen,
  onToggle,
  onNavigate,
  t,
}: {
  activeId: TocId;
  mobileTocOpen: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  t: GuideT;
}) {
  const activeLabel = t(`toc.${activeId}`);

  return (
    <div className="sticky top-0 z-30 -mx-4 mb-6 bg-background px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 md:-mx-6 md:px-6 lg:hidden">
      <Card>
        <CardHeader className="p-0">
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-11 w-full items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-sm font-medium leading-none text-foreground hover:bg-transparent"
            aria-expanded={mobileTocOpen}
            onClick={onToggle}
          >
            <span className="flex min-w-0 items-center gap-2">
              <ListOrdered className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 whitespace-normal text-left leading-snug">
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
            onNavigate={onNavigate}
            t={t}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export function GuideDesktopToc({
  activeId,
  t,
}: {
  activeId: TocId;
  t: GuideT;
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
              <ListOrdered className="h-3.5 w-3.5 text-muted-foreground" />
              {t("tocTitle")}
            </SidebarGroupLabel>
          </SidebarGroup>
          {GUIDE_GROUPS.map((group) => (
            <SidebarGroup key={group.id}>
              <SidebarGroupLabel className="text-[10px] font-medium uppercase tracking-wider">
                {t(`groups.${group.id}`)}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.ids.map((id) => (
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
          ))}
        </SidebarContent>
      </Sidebar>
    </nav>
  );
}
