import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/profile", label: "Profile", testId: "account-nav-profile" },
  {
    to: "/settings/workspace",
    label: "Workspace",
    testId: "account-nav-workspace",
  },
] as const;

function AccountNav() {
  return (
    <nav
      data-testid="account-nav"
      className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-border pb-2 lg:w-48 lg:flex-col lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4"
    >
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          data-testid={link.testId}
          className={({ isActive }) =>
            cn(
              "rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors",
              isActive
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )
          }
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default AccountNav;
