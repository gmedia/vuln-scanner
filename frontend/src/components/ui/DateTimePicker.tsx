import { useState } from "react";
import { format, parse, isValid } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import { Calendar } from "./Calendar";
import { Input } from "./Input";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";

export interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

function parseLocalDateTime(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, "yyyy-MM-dd'T'HH:mm", new Date());
  return isValid(parsed) ? parsed : undefined;
}

function DateTimePicker({
  value,
  onChange,
  id,
  placeholder = "Pilih tanggal & jam",
  disabled,
  className,
  "aria-label": ariaLabel,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseLocalDateTime(value);
  const timePart = selected ? format(selected, "HH:mm") : "00:00";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "h-10 w-full justify-start text-left font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-60" />
          {selected ? (
            format(selected, "dd/MM/yyyy HH:mm")
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (!date) {
              onChange("");
              return;
            }
            const [h, m] = timePart.split(":");
            date.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
            onChange(format(date, "yyyy-MM-dd'T'HH:mm"));
          }}
          defaultMonth={selected}
          autoFocus
        />
        <div className="flex items-center gap-2 border-t border-border p-2">
          <Input
            type="time"
            step={60}
            value={timePart}
            aria-label="Jam (24 jam)"
            className="h-8 w-[7.5rem]"
            onChange={(e) => {
              const t = e.target.value || "00:00";
              const base = selected ?? new Date();
              const [h, m] = t.split(":");
              base.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
              onChange(format(base, "yyyy-MM-dd'T'HH:mm"));
            }}
          />
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto text-xs text-muted-foreground"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Hapus
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { DateTimePicker };
