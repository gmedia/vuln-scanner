import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const tabsListVariants = cva(
  "group/tabs-list inline-flex items-center text-muted-foreground",
  {
    variants: {
      variant: {
        default: "h-10 justify-center rounded-md bg-muted p-1",
        line: "h-auto justify-start gap-1 rounded-none border-b border-border bg-transparent p-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type TabsListProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>;

const TabsList = forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, variant = "default", ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    data-variant={variant}
    className={cn(tabsListVariants({ variant }), className)}
    {...props}
  />
));
TabsList.displayName = "TabsList";

const TabsTrigger = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, onMouseDown, onKeyDown, onFocus, onBlur, ...props }, ref) => {
  // Radix calls `currentTarget.focus()` on mouse-down, and Chrome treats scripted
  // focus as keyboard-ish until it has seen a pointer gesture — so the first click
  // after a reload paints the ring. Track modality ourselves: pointer press never
  // shows it, keyboard focus always does.
  const pointerPressRef = useRef(false);
  const [pointerFocus, setPointerFocus] = useState(false);

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      data-pointer-focus={pointerFocus ? "true" : undefined}
      className={cn(
        "relative inline-flex items-center justify-center whitespace-nowrap rounded-xs px-3 py-1.5 text-sm font-medium transition-all duration-200",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]",
        "data-[pointer-focus=true]:focus-visible:ring-0 data-[pointer-focus=true]:focus-visible:ring-offset-0",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:bg-transparent",
        "group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none",
        "after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-foreground after:opacity-0 after:transition-opacity after:duration-200",
        "motion-reduce:after:transition-none",
        "group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        className,
      )}
      onMouseDown={(event) => {
        if (event.button === 0) {
          pointerPressRef.current = true;
          setPointerFocus(true);
        }
        onMouseDown?.(event);
      }}
      onKeyDown={(event) => {
        pointerPressRef.current = false;
        setPointerFocus(false);
        onKeyDown?.(event);
      }}
      onFocus={(event) => {
        setPointerFocus(pointerPressRef.current);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        pointerPressRef.current = false;
        setPointerFocus(false);
        onBlur?.(event);
      }}
      {...props}
    />
  );
});
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";

function TabCount({ value }: { readonly value: number }) {
  if (value <= 0) return null;
  return (
    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
      {value}
    </span>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, TabCount };
