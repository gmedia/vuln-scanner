import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Check, ChevronDown, Loader2, Users } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OrgSwitcherProps {
  className?: string;
  compact?: boolean;
}

function OrgSwitcher({ className, compact = false }: OrgSwitcherProps) {
  const { t } = useTranslation("workspace");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const organizations = useAuthStore((s) => s.organizations);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const switchOrganization = useAuthStore((s) => s.switchOrganization);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const active =
    organizations.find((o) => o.id === activeOrgId) ?? organizations[0];

  if (!isAuthenticated || organizations.length === 0) {
    return null;
  }

  async function handleSwitch(orgId: string) {
    if (orgId === activeOrgId || switching) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    const ok = await switchOrganization(orgId);
    setSwitching(false);
    setOpen(false);
    if (ok) {
      await queryClient.invalidateQueries();
      navigate("/dashboard");
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="org-switcher"
          aria-haspopup="listbox"
          disabled={switching}
          className={cn(
            "h-9 max-w-[14rem] justify-start gap-1.5 bg-muted/40 px-2.5 text-xs text-foreground hover:text-primary",
            compact && "max-w-[10rem]",
            className,
          )}
        >
          {switching ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
          ) : (
            <Building2
              className="h-3.5 w-3.5 shrink-0 text-primary"
              aria-hidden
            />
          )}
          <span className="truncate font-medium">
            {active?.name ?? t("title")}
          </span>
          {active?.role && (
            <span className="hidden shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground sm:inline">
              {active.role}
            </span>
          )}
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64"
        data-testid="org-switcher-menu"
      >
        <DropdownMenuLabel className="text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
          {t("title")}
        </DropdownMenuLabel>
        {organizations.map((org) => {
          const selected = org.id === (activeOrgId ?? active?.id);
          return (
            <DropdownMenuItem
              key={org.id}
              data-testid={`org-option-${org.id}`}
              onSelect={() => {
                void handleSwitch(org.id);
              }}
              className={cn(selected && "bg-primary/10 text-primary")}
            >
              <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{org.name}</span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  {org.slug} · {org.role}
                </span>
              </span>
              {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="org-members-link"
          onSelect={() => {
            navigate("/settings/workspace");
          }}
        >
          <Users className="h-3.5 w-3.5" />
          {t("membersAndInvites")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default OrgSwitcher;
