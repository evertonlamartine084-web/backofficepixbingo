import * as React from "react";
import { Calendar, CalendarProps } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

interface DateTimePickerProps {
  date?: Date;
  onSelect: (date: Date | undefined) => void;
  disabled?: CalendarProps["disabled"];
  className?: string;
}

function DateTimePicker({ date, onSelect, disabled, className }: DateTimePickerProps) {
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(date);
  const hours = React.useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = React.useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  const currentHour = selectedDate?.getHours() ?? 0;
  const currentMinute = selectedDate?.getMinutes() ?? 0;

  const hourRef = React.useRef<HTMLDivElement>(null);
  const minuteRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setSelectedDate(date);
  }, [date]);

  // Scroll to selected time on mount
  React.useEffect(() => {
    const scrollToSelected = (ref: React.RefObject<HTMLDivElement>, index: number) => {
      if (ref.current) {
        const items = ref.current.querySelectorAll("[data-time-item]");
        if (items[index]) {
          items[index].scrollIntoView({ block: "center", behavior: "auto" });
        }
      }
    };
    setTimeout(() => {
      scrollToSelected(hourRef, currentHour);
      scrollToSelected(minuteRef, currentMinute);
    }, 50);
  }, [currentHour, currentMinute]);

  const handleDateSelect = (day: Date | undefined) => {
    if (!day) return;
    const newDate = new Date(day);
    newDate.setHours(currentHour, currentMinute, 0, 0);
    setSelectedDate(newDate);
    onSelect(newDate);
  };

  const handleTimeChange = (type: "hour" | "minute", value: number) => {
    const base = selectedDate ? new Date(selectedDate) : new Date();
    if (type === "hour") {
      base.setHours(value);
    } else {
      base.setMinutes(value);
    }
    base.setSeconds(0, 0);
    setSelectedDate(base);
    onSelect(base);
  };

  return (
    <div className={cn("flex", className)}>
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={handleDateSelect}
        disabled={disabled}
        className="p-3 pointer-events-auto"
      />
      <div className="flex border-l border-border">
        <ScrollArea className="h-[300px] w-[54px]" ref={hourRef}>
          <div className="flex flex-col items-center py-1">
            {hours.map((h) => (
              <button
                key={h}
                data-time-item
                onClick={() => handleTimeChange("hour", h)}
                className={cn(
                  "w-10 h-8 text-sm rounded-md flex items-center justify-center transition-colors",
                  currentHour === h
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {String(h).padStart(2, "0")}
              </button>
            ))}
          </div>
        </ScrollArea>
        <ScrollArea className="h-[300px] w-[54px] border-l border-border" ref={minuteRef}>
          <div className="flex flex-col items-center py-1">
            {minutes.map((m) => (
              <button
                key={m}
                data-time-item
                onClick={() => handleTimeChange("minute", m)}
                className={cn(
                  "w-10 h-8 text-sm rounded-md flex items-center justify-center transition-colors",
                  currentMinute === m
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {String(m).padStart(2, "0")}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

DateTimePicker.displayName = "DateTimePicker";

export { DateTimePicker };
