import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./buttonVariants";

export type CalendarProps = DayPickerProps;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: cn("rdp-root", classNames?.root),
        months: cn(
          "flex flex-col space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0",
          classNames?.months,
        ),
        month: cn("space-y-4", classNames?.month),
        month_caption: cn(
          "relative flex h-8 items-center justify-center",
          classNames?.month_caption,
        ),
        caption_label: cn(
          "text-sm font-medium text-foreground",
          classNames?.caption_label,
        ),
        nav: cn(
          "absolute inset-x-0 top-0 flex items-center justify-between px-1",
          classNames?.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "absolute left-1 h-7 w-7 bg-transparent p-0 opacity-60 hover:opacity-100",
          classNames?.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "absolute right-1 h-7 w-7 bg-transparent p-0 opacity-60 hover:opacity-100",
          classNames?.button_next,
        ),
        month_grid: cn(
          "w-full border-collapse space-y-1",
          classNames?.month_grid,
        ),
        weekdays: cn("flex", classNames?.weekdays),
        weekday: cn(
          "w-9 rounded-md text-[0.8rem] font-normal text-muted-foreground",
          classNames?.weekday,
        ),
        weeks: cn("flex flex-col space-y-1 mt-1", classNames?.weeks),
        week: cn("flex w-full mt-1", classNames?.week),
        day: cn(
          "relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20",
          classNames?.day,
        ),
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100",
          classNames?.day_button,
        ),
        selected: cn(
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground rounded-md",
          classNames?.selected,
        ),
        today: cn(
          "bg-accent text-accent-foreground rounded-md",
          classNames?.today,
        ),
        outside: cn(
          "text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
          classNames?.outside,
        ),
        disabled: cn("text-muted-foreground opacity-50", classNames?.disabled),
        hidden: cn("invisible", classNames?.hidden),
        range_start: cn("rounded-l-md", classNames?.range_start),
        range_middle: cn(
          "aria-selected:bg-accent aria-selected:text-accent-foreground rounded-none",
          classNames?.range_middle,
        ),
        range_end: cn("rounded-r-md", classNames?.range_end),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
        ...props.components,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
