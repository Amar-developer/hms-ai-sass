import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type WeekdayMode = "" | "daily" | "mon-saturday" | "custom";

interface WeekdaySelectorProps {
  mode: WeekdayMode;
  selectedDays: string[];
  onModeChange: (mode: WeekdayMode) => void;
  onDaysChange: (days: string[]) => void;
}

const MODE_OPTIONS = [
  { value: "", label: "Select weekday", disabled: true },
  { value: "daily", label: "Daily" },
  { value: "mon-saturday", label: "Mon - Saturday" },
  { value: "custom", label: "Custom" },
];

const WEEKDAYS = [
  { value: "0", label: "Monday" },
  { value: "1", label: "Tuesday" },
  { value: "2", label: "Wednesday" },
  { value: "3", label: "Thursday" },
  { value: "4", label: "Friday" },
  { value: "5", label: "Saturday" },
  { value: "6", label: "Sunday" },
];

export function WeekdaySelector({
  mode,
  selectedDays,
  onModeChange,
  onDaysChange,
}: WeekdaySelectorProps) {
  const [open, setOpen] = useState(false);

  const ref = useRef<HTMLDivElement>(null);

  // Outside click close
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);

    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, []);

  function changeMode(value: WeekdayMode) {
    onModeChange(value);

    if (value === "daily") {
      // Select all 7 days
      onDaysChange(WEEKDAYS.map((day) => day.value));
    }

    if (value === "mon-saturday") {
      // Select Monday to Saturday only (excludes Sunday, value "6")
      onDaysChange(
        WEEKDAYS.filter((day) => day.value !== "6").map((day) => day.value),
      );
    }

    if (value === "custom") {
      // Keep existing selected days
      onDaysChange(selectedDays);
    }
  }

  function toggleDay(day: string) {
    if (selectedDays.includes(day)) {
      onDaysChange(selectedDays.filter((d) => d !== day));
    } else {
      onDaysChange([...selectedDays, day]);
    }
  }

  const selectedLabel =
    MODE_OPTIONS.find((item) => item.value === mode)?.label ?? "Select";

  return (
    <div ref={ref} className="relative">
      {/* Main dropdown button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="
          flex w-full items-center justify-between
          rounded-lg border border-slate-200
          bg-white px-3 py-2 text-left text-sm
        "
      >
        {selectedLabel}

        <ChevronDown size={16} className={open ? "rotate-180" : ""} />
      </button>

      {open && (
        <div
          className="
            absolute z-50 mt-1 w-full
            rounded-lg border border-slate-200
            bg-white shadow-lg
          "
        >
          {/* Modes */}
          {MODE_OPTIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                if (!item.disabled) {
                  changeMode(item.value as WeekdayMode);
                }
              }}
              className={`
      block w-full px-4 py-2
      text-left text-sm
      ${
        item.disabled
          ? "cursor-not-allowed text-slate-400"
          : "hover:bg-slate-50"
      }
      ${mode === item.value ? "bg-slate-50 font-bold" : ""}
    `}
            >
              {item.label}
            </button>
          ))}

          {/* Custom weekdays */}
          {mode === "custom" && (
            <div
              className="
                border-t border-slate-200
                p-3
                grid grid-cols-2 gap-2
              "
            >
              {WEEKDAYS.map((day) => (
                <label
                  key={day.value}
                  className="
                    flex items-center gap-2
                    cursor-pointer
                    rounded px-2 py-1
                    hover:bg-slate-50
                  "
                >
                  <input
                    type="checkbox"
                    checked={selectedDays.includes(day.value)}
                    onChange={() => toggleDay(day.value)}
                  />

                  <span className="text-sm">{day.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
