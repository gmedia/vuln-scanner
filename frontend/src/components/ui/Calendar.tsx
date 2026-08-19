import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DayPicker,
  getDefaultClassNames,
  type DayPickerProps,
} from "react-day-picker";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./buttonVariants";

export type CalendarProps = DayPickerProps;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      navLayout="around"
      className={cn("p-3", className)}
      classNames={{
        root: cn(defaults.root, "w-fit", classNames?.root),
        months: cn(
          defaults.months,
          "relative flex flex-col space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0",
          classNames?.months,
        ),
        month: cn(defaults.month, "relative space-y-4", classNames?.month),
        month_caption: cn(
          defaults.month_caption,
          "relative flex h-8 w-full items-center justify-center px-9",
          classNames?.month_caption,
        ),
        caption_label: cn(
          defaults.caption_label,
          "text-sm font-medium text-foreground",
          classNames?.caption_label,
        ),
        nav: cn(
          defaults.nav,
          "absolute inset-x-0 top-0 z-10 flex h-8 items-center justify-between px-0",
          classNames?.nav,
        ),
        button_previous: cn(
          defaults.button_previous,
          buttonVariants({ variant: "outline" }),
          "absolute left-1 top-0 size-7 bg-transparent p-0 opacity-60 hover:opacity-100",
          classNames?.button_previous,
        ),
        button_next: cn(
          defaults.button_next,
          buttonVariants({ variant: "outline" }),
          "absolute right-1 top-0 size-7 bg-transparent p-0 opacity-60 hover:opacity-100",
          classNames?.button_next,
        ),
        month_grid: cn(
          defaults.month_grid,
          "w-full border-collapse space-y-1",
          classNames?.month_grid,
        ),
        weekdays: cn(defaults.weekdays, "flex", classNames?.weekdays),
        weekday: cn(
          defaults.weekday,
          "w-9 rounded-md text-[0.8rem] font-normal text-muted-foreground",
          classNames?.weekday,
        ),
        weeks: cn(
          defaults.weeks,
          "mt-1 flex flex-col space-y-1",
          classNames?.weeks,
        ),
        week: cn(defaults.week, "mt-1 flex w-full", classNames?.week),
        day: cn(
          defaults.day,
          "relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20",
          classNames?.day,
        ),
        day_button: cn(
          defaults.day_button,
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100",
          classNames?.day_button,
        ),
        selected: cn(
          defaults.selected,
          "rounded-md bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
          classNames?.selected,
        ),
        today: cn(
          defaults.today,
          "rounded-md bg-accent text-accent-foreground",
          classNames?.today,
        ),
        outside: cn(
          defaults.outside,
          "text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
          classNames?.outside,
        ),
        disabled: cn(
          defaults.disabled,
          "text-muted-foreground opacity-50",
          classNames?.disabled,
        ),
        hidden: cn(defaults.hidden, "invisible", classNames?.hidden),
        range_start: cn(
          defaults.range_start,
          "rounded-l-md",
          classNames?.range_start,
        ),
        range_middle: cn(
          defaults.range_middle,
          "rounded-none aria-selected:bg-accent aria-selected:text-accent-foreground",
          classNames?.range_middle,
        ),
        range_end: cn(defaults.range_end, "rounded-r-md", classNames?.range_end),
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          ),
        ...props.components,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
