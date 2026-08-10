import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Check, ChevronDown, Loader2, Users } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface OrgSwitcherProps {
  className?: string;
  compact?: boolean;
}

function OrgSwitcher({ className, compact = false }: OrgSwitcherProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const organizations = useAuthStore((s) => s.organizations);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const switchOrganization = useAuthStore((s) => s.switchOrganization);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const active =
    organizations.find((o) => o.id === activeOrgId) ?? organizations[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        data-testid="org-switcher"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={switching}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex min-h-9 max-w-[14rem] items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60",
          compact && "max-w-[10rem]",
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
          {active?.name ?? "Workspace"}
        </span>
        {active?.role && (
          <span className="hidden shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground sm:inline">
            {active.role}
          </span>
        )}
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div
          role="listbox"
          data-testid="org-switcher-menu"
          className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-border bg-card p-1 shadow-lg"
        >
          <p className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Workspace
          </p>
          <ul className="max-h-56 space-y-0.5 overflow-y-auto">
            {organizations.map((org) => {
              const selected = org.id === (activeOrgId ?? active?.id);
              return (
                <li key={org.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-testid={`org-option-${org.id}`}
                    onClick={() => void handleSwitch(org.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors",
                      selected
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-accent",
                    )}
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {org.name}
                      </span>
                      <span className="block truncate font-mono text-[10px] text-muted-foreground">
                        {org.slug} · {org.role}
                      </span>
                    </span>
                    {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              data-testid="org-members-link"
              onClick={() => {
                setOpen(false);
                navigate("/settings/workspace");
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Users className="h-3.5 w-3.5" />
              Members & invites
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrgSwitcher;
