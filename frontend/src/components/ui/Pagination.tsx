import type { ButtonHTMLAttributes, HTMLAttributes, LiHTMLAttributes } from "react";
import { forwardRef } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./buttonVariants";

const Pagination = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <nav
      ref={ref}
      role="navigation"
      aria-label="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  ),
);
Pagination.displayName = "Pagination";

const PaginationContent = forwardRef<
  HTMLUListElement,
  HTMLAttributes<HTMLUListElement>
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn("flex flex-row items-center gap-1", className)}
    {...props}
  />
));
PaginationContent.displayName = "PaginationContent";

const PaginationItem = forwardRef<HTMLLIElement, LiHTMLAttributes<HTMLLIElement>>(
  ({ className, ...props }, ref) => (
    <li ref={ref} className={cn("", className)} {...props} />
  ),
);
PaginationItem.displayName = "PaginationItem";

type PaginationButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  isActive?: boolean;
  size?: "default" | "sm" | "lg" | "icon";
};

const PaginationLink = forwardRef<HTMLButtonElement, PaginationButtonProps>(
  ({ className, isActive, size = "icon", ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-current={isActive ? "page" : undefined}
      className={cn(
        buttonVariants({
          variant: isActive ? "outline" : "ghost",
          size,
        }),
        className,
      )}
      {...props}
    />
  ),
);
PaginationLink.displayName = "PaginationLink";

const PaginationPrevious = forwardRef<
  HTMLButtonElement,
  PaginationButtonProps
>(({ className, children, ...props }, ref) => (
  <PaginationLink
    ref={ref}
    size="sm"
    aria-label="Previous page"
    className={cn("gap-1 px-2.5", className)}
    {...props}
  >
    <ChevronLeft className="h-3.5 w-3.5" />
    {children}
  </PaginationLink>
));
PaginationPrevious.displayName = "PaginationPrevious";

const PaginationNext = forwardRef<HTMLButtonElement, PaginationButtonProps>(
  ({ className, children, ...props }, ref) => (
    <PaginationLink
      ref={ref}
      size="sm"
      aria-label="Next page"
      className={cn("gap-1 px-2.5", className)}
      {...props}
    >
      {children}
      <ChevronRight className="h-3.5 w-3.5" />
    </PaginationLink>
  ),
);
PaginationNext.displayName = "PaginationNext";

const PaginationEllipsis = ({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) => (
  <span
    aria-hidden
    className={cn("flex h-9 w-9 items-center justify-center", className)}
    {...props}
  >
    <MoreHorizontal className="h-4 w-4" />
    <span className="sr-only">More pages</span>
  </span>
);
PaginationEllipsis.displayName = "PaginationEllipsis";

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};
