import { useState } from "react";
import { format, parse, isValid } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import { Calendar } from "./Calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./Select";

export interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0"),
);
const MINUTES = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, "0"),
);

function parseLocalDateTime(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, "yyyy-MM-dd'T'HH:mm", new Date());
  return isValid(parsed) ? parsed : undefined;
}

function emitDateTime(date: Date, hour: string, minute: string): string {
  const next = new Date(date);
  next.setHours(Number(hour) || 0, Number(minute) || 0, 0, 0);
  return format(next, "yyyy-MM-dd'T'HH:mm");
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
  const [hour, minute] = (selected ? format(selected, "HH:mm") : "00:00").split(
    ":",
  );

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
            "h-10 min-h-10 w-full min-w-0 justify-start overflow-hidden border border-border bg-input px-3 text-left font-normal shadow-none hover:bg-input",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-60" />
          <span className="min-w-0 truncate tabular-nums">
            {selected ? format(selected, "dd/MM/yyyy HH:mm") : placeholder}
          </span>
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
            onChange(emitDateTime(date, hour, minute));
          }}
          defaultMonth={selected}
          autoFocus
        />
        <div className="flex items-center gap-2 border-t border-border p-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Select
              value={hour}
              onValueChange={(h) => {
                const base = selected ?? new Date();
                onChange(emitDateTime(base, h, minute));
              }}
            >
              <SelectTrigger
                className="h-8 w-[4.5rem]"
                aria-label="Jam (24 jam)"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                {HOURS.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground" aria-hidden>
              :
            </span>
            <Select
              value={minute}
              onValueChange={(m) => {
                const base = selected ?? new Date();
                onChange(emitDateTime(base, hour, m));
              }}
            >
              <SelectTrigger className="h-8 w-[4.5rem]" aria-label="Menit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                {MINUTES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 text-xs text-muted-foreground"
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
