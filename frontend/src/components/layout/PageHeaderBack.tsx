import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface PageHeaderBackProps {
  to: string;
  label: string;
  className?: string;
}

/**
 * Child/detail back control for `PageHeader` `leading`.
 * Do not use on sidebar destinations (Assets, Guard, scan forms, …).
 */
function PageHeaderBack({ to, label, className }: PageHeaderBackProps) {
  return (
    <Link
      to={to}
      className={cn(
        "mt-0.5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className,
      )}
    >
      <ArrowLeft className="h-5 w-5" aria-hidden />
      <span className="sr-only">{label}</span>
    </Link>
  );
}

export default PageHeaderBack;
