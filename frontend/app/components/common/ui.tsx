import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Info,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { displayToIsoDate, isoToDisplayDate } from "@/utils/helper";

export function Card({
  children,
  className = "px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}
export function Badge({
  children,
  tone = "slate",
  className = "px-2 py-2  text-xs lg:text-sm flex justify-center items-center",
}: {
  children: React.ReactNode;
  tone?: "slate" | "red" | "green" | "blue" | "amber" | "purple";
  className?: string;
}) {
  const m: any = {
    slate: "bg-slate-100 text-slate-700",
    red: "bg-danger-soft text-danger-fg",
    green: "bg-success-soft text-success-fg",
    blue: "bg-info-soft text-info-fg",
    amber: "bg-warning-soft text-warning-fg",
    purple: "bg-purple-100 text-purple-700",
  };
  return (
    <span
      className={` flex justify-center items-center font-bold ${m[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export type NoticeTone = "success" | "warning" | "delete" | "info" | "error";

export function noticeTone(message: string): NoticeTone {
  const text = String(message || "").toLowerCase();
  if (!text) return "info";
  if (
    /denied|not allowed|not assigned|unauthorized|forbidden|failed|could not|error|invalid|missing|required|does not|not found/.test(
      text,
    )
  )
    return "error";
  if (
    /delete|deleted|deactivated|removed|suspended|cancelled|inactive/.test(text)
  )
    return "delete";
  if (/already|choose|select|warning|queued|called|request/.test(text))
    return "warning";
  if (
    /created|updated|saved|linked|assigned|uploaded|generated|recorded|success|activated|changed|complete|completed/.test(
      text,
    )
  )
    return "success";
  return "info";
}

export function StatusToast({
  message,
  tone,
  onClose,
  duration = 5000,
}: {
  message?: string;
  tone?: NoticeTone;
  onClose?: () => void;
  duration?: number;
}) {
  const [shrink, setShrink] = useState(false);
  useEffect(() => {
    if (!message) return undefined;
    setShrink(false);
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setShrink(true)),
    );
    const timer =
      onClose && duration > 0
        ? window.setTimeout(onClose, duration)
        : undefined;
    return () => {
      cancelAnimationFrame(raf);
      if (timer) window.clearTimeout(timer);
    };
  }, [duration, message, onClose]);

  if (!message) return null;

  const resolvedTone = tone || noticeTone(message);
  const styles: Record<
    NoticeTone,
    { icon: any; iconClass: string; bar: string; label: string }
  > = {
    success: {
      icon: CheckCircle2,
      iconClass: "fill-success-solid text-white",
      bar: "bg-success-solid",
      label: "Success",
    },
    warning: {
      icon: AlertTriangle,
      iconClass: "fill-warning-solid text-white",
      bar: "bg-warning-solid",
      label: "Warning",
    },
    delete: {
      icon: XCircle,
      iconClass: "fill-danger-solid text-white",
      bar: "bg-danger-solid",
      label: "Deleted",
    },
    info: {
      icon: Info,
      iconClass: "fill-info-solid text-white",
      bar: "bg-info-solid",
      label: "Info",
    },
    error: {
      icon: XCircle,
      iconClass: "fill-danger-solid text-white",
      bar: "bg-danger-solid",
      label: "Error",
    },
  };
  const current = styles[resolvedTone];
  const Icon = current.icon;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[80] w-[calc(100vw-2rem)] max-w-sm">
      <div
        role="status"
        className="pointer-events-auto overflow-hidden rounded bg-white text-slate-800 shadow-xl ring-1 ring-slate-900/10"
      >
        <div className="flex min-h-[58px] items-center gap-3 px-4 py-3">
          <Icon
            size={24}
            className={`shrink-0 rounded-full ${current.iconClass}`}
          />
          <p className="min-w-0 flex-1 break-words text-sm">
            <span className="font-semibold">{current.label}:</span> {message}
          </p>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close notification"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="h-1 w-full bg-slate-100">
          <div
            className={`h-full ${current.bar}`}
            style={{
              width: shrink ? "100%" : "0%",
              transition:
                duration > 0 ? `width ${duration}ms linear` : undefined,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm lg:text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function submitNearestFormOnEnter(event: any) {
  const control = event.currentTarget;
  if (control.form) {
    control.form.requestSubmit();
    return;
  }
  const actionPattern =
    /^(save|add|create|update|assign|link|book|release|submit|return expired)/i;
  const excludePattern =
    /cancel|close|back|delete|remove|deactivate|pdf|view|edit|new /i;
  for (
    let node = control.parentElement;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const actions = Array.from(node.querySelectorAll("button")).filter(
      (button: any) => {
        const label = String(button.textContent || "").trim();
        return (
          !button.disabled &&
          actionPattern.test(label) &&
          !excludePattern.test(label)
        );
      },
    ) as any[];
    if (actions.length === 1) {
      actions[0].click();
      return;
    }
  }
}
const DATE_MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DATE_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseIsoParts(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
}

export function DateInput({
  className = "",
  onChange,
  value,
  defaultValue,
  name,
  min,
  max,
  disabled,
  required,
  ...props
}: any) {
  const isControlled = value !== undefined;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [innerValue, setInnerValue] = useState(String(defaultValue || ""));
  const isoValue = String(isControlled ? value || "" : innerValue || "");
  const [displayValue, setDisplayValue] = useState(isoToDisplayDate(isoValue));
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [viewMonth, setViewMonth] = useState(() => {
    const parsed = parseIsoParts(isoValue);
    const base = parsed ? new Date(parsed.year, parsed.month, 1) : new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  useEffect(() => {
    if (isControlled) setDisplayValue(isoToDisplayDate(isoValue));
  }, [isControlled, isoValue]);

  useEffect(() => {
    if (!open) return;
    function reposition() {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect || typeof window === "undefined") return;
      const POPUP_W = 288;
      const POPUP_H = 340;
      const GAP = 4;
      const MARGIN = 8;
      let left = rect.left;
      if (left + POPUP_W > window.innerWidth - MARGIN)
        left = rect.right - POPUP_W;
      left = Math.min(
        Math.max(left, MARGIN),
        Math.max(MARGIN, window.innerWidth - POPUP_W - MARGIN),
      );
      let top = rect.bottom + GAP;
      if (top + POPUP_H > window.innerHeight - MARGIN && rect.top > POPUP_H) {
        top = rect.top - POPUP_H - GAP;
      }
      top = Math.min(
        Math.max(top, MARGIN),
        Math.max(MARGIN, window.innerHeight - POPUP_H - MARGIN),
      );
      setCoords({ top, left });
    }
    reposition();
    function onDocClick(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  function emit(nextIso: string) {
    if (!isControlled) setInnerValue(nextIso);
    onChange?.({ target: { value: nextIso, name } });
  }

  function changeDisplay(nextDisplay: string) {
    setDisplayValue(nextDisplay);
    const nextIso = displayToIsoDate(nextDisplay);
    if (nextIso || !nextDisplay.trim()) emit(nextIso);
  }

  const hiddenValue = displayToIsoDate(displayValue) || isoValue;

  function openCalendar() {
    if (disabled) return;
    const parsed = parseIsoParts(hiddenValue);
    if (parsed) setViewMonth({ year: parsed.year, month: parsed.month });
    setOpen((previous) => !previous);
  }

  function shiftMonth(delta: number) {
    setViewMonth((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  function selectDay(day: number) {
    const mm = String(viewMonth.month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const iso = `${viewMonth.year}-${mm}-${dd}`;
    if (min && iso < min) return;
    if (max && iso > max) return;
    setDisplayValue(isoToDisplayDate(iso));
    emit(iso);
    setOpen(false);
  }

  const selectedParts = parseIsoParts(hiddenValue);
  const firstWeekday = new Date(viewMonth.year, viewMonth.month, 1).getDay();
  const daysInMonth = new Date(
    viewMonth.year,
    viewMonth.month + 1,
    0,
  ).getDate();
  const calendarCells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  return (
    <div ref={wrapperRef} className="relative">
      {name && <input type="hidden" name={name} value={hiddenValue} />}
      <input
        {...props}
        type="text"
        value={displayValue}
        onChange={(event: any) => changeDisplay(event.target.value)}
        onBlur={() =>
          setDisplayValue(isoToDisplayDate(hiddenValue, displayValue))
        }
        onFocus={(event: any) => props.onFocus?.(event)}
        aria-required={required || undefined}
        disabled={disabled}
        placeholder={props.placeholder || "dd/mm/yyyy"}
        inputMode="numeric"
        className={`w-full rounded-lg border border-slate-200 px-2 py-1.5 pr-10 lg:px-4 lg:py-3 text-[10px] lg:text-sm outline-none focus:border-slate-500 disabled:bg-slate-50 disabled:text-slate-400 ${className}`}
      />
      <button
        type="button"
        onClick={openCalendar}
        disabled={disabled}
        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-40"
        aria-label="Choose date"
      >
        <CalendarDays size={16} />
      </button>
      {open && (
        <div
          role="dialog"
          style={{
            position: "fixed",
            top: coords?.top ?? 0,
            left: coords?.left ?? 0,
            width: 288,
            visibility: coords ? "visible" : "hidden",
          }}
          className="z-50 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-slate-500 hover:bg-slate-100"
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="text-sm font-bold text-slate-700">
              {DATE_MONTH_LABELS[viewMonth.month]} {viewMonth.year}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-slate-500 hover:bg-slate-100"
              aria-label="Next month"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase text-slate-400">
            {DATE_WEEKDAY_LABELS.map((label) => (
              <span key={label} className="py-1">
                {label}
              </span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {calendarCells.map((day, index) => {
              if (day === null) return <span key={`blank-${index}`} />;
              const mm = String(viewMonth.month + 1).padStart(2, "0");
              const dd = String(day).padStart(2, "0");
              const iso = `${viewMonth.year}-${mm}-${dd}`;
              const isSelected =
                selectedParts &&
                selectedParts.year === viewMonth.year &&
                selectedParts.month === viewMonth.month &&
                selectedParts.day === day;
              const isDisabled = Boolean(
                (min && iso < min) || (max && iso > max),
              );
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => selectDay(day)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm transition ${
                    isSelected
                      ? "bg-slate-900 font-bold text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  } disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                setViewMonth({
                  year: today.getFullYear(),
                  month: today.getMonth(),
                });
              }}
              className="font-bold text-slate-600 hover:text-slate-900"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                setDisplayValue("");
                emit("");
                setOpen(false);
              }}
              className="font-bold text-blue-600 hover:text-blue-800"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Input({
  className = "rounded-lg px-2 py-2 lg:px-4 lg:py-2.5 text-xs lg:text-xs placeholder:text-xs",
  mobileNumber = false,
  ...props
}: any) {
  const [error, setError] = useState("");

  if (props.type === "date") {
    const { type: _type, ...dateProps } = props;
    return <DateInput {...dateProps} className={className} />;
  }

  return (
    <>
      <input
        {...props}
        onChange={(e) => {
          let value = e.target.value;

          if (mobileNumber) {
            value = value.replace(/\D/g, "").slice(0, 10);
            e.target.value = value;

            if (value.length > 0 && value.length < 10) {
              setError("Mobile number must be 10 digits");
            } else {
              setError("");
            }
          }

          props.onChange?.(e);
        }}
        className={`w-full rounded-lg border border-slate-200 outline-none focus:border-slate-500 ${className}`}
      />

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </>
  );
}

export function SuggestionInput({
  suggestions = [],
  className = "",
  defaultValue = "",
  onChange,
  disabled,
  ...props
}: any) {
  const [value, setValue] = useState(String(defaultValue || props.value || ""));
  const [open, setOpen] = useState(false);
  const query = value.trim().toLowerCase();
  const filtered = suggestions
    .filter((item: string) => {
      if (!query) return true;
      return item.toLowerCase().includes(query);
    })
    .slice(0, 8);

  function setNext(next: string) {
    setValue(next);
    onChange?.({ target: { value: next } });
  }

  return (
    <div className="relative">
      <input
        {...props}
        disabled={disabled}
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(event: any) => {
          setNext(event.target.value);
          setOpen(true);
        }}
        autoComplete="off"
        className={`w-full rounded-lg border border-slate-200 px-2 py-3 lg:px-4 lg:py-2.5 text-xs  lg:text-sm outline-none focus:border-slate-500 disabled:bg-slate-50 disabled:text-slate-400 ${className}`}
      />
      {open && !disabled && filtered.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {filtered.map((item: string) => (
            <button
              key={item}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                setNext(item);
                setOpen(false);
              }}
              className={`block w-full rounded-lg px-3 py-2 text-xs lg:text-sm text-left scrollbar-hidden hover:bg-slate-50 ${
                item.toLowerCase() === query ? "bg-slate-50 font-bold" : ""
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Select({
  className = "rounded-lg px-2 py-2.5 lg:px-4 lg:py-3 text-sm",
  children,
  ...props
}: any) {
  return (
    <select
      {...props}
      className={`w-full border border-slate-200 bg-white outline-none focus:border-slate-500 ${className}`}
    >
      {children}
    </select>
  );
}

type SearchableOption = { value: string; label: string; sublabel?: string };
type SearchableSelectProps = {
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  disabled?: boolean;
  allowCustom?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  maxOptions?: number;
  className?: string;
};

export function SearchableSelect({
  name,
  value = "",
  onChange,
  options,
  placeholder = "Select...",
  disabled = false,
  allowCustom = false,
  searchPlaceholder = "Search...",
  emptyText = "No matches.",
  maxOptions = 200,
  className = "",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(trimmed) ||
        String(option.value).toLowerCase().includes(trimmed) ||
        (option.sublabel || "").toLowerCase().includes(trimmed),
    );
  }, [options, query]);

  const selected = options.find((option) => option.value === value);
  const displayLabel = selected?.label || (value && allowCustom ? value : "");
  const matchesExisting = filtered.some(
    (option) => option.value === query.trim(),
  );

  function commit(next: string) {
    onChange?.(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {name ? <input type="hidden" name={name} value={value || ""} /> : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white py-2 px-2 lg:px-4 lg:py-3 text-left text-xs lg:text-sm outline-none focus:border-slate-500 disabled:bg-slate-50 disabled:text-slate-400"
      >
        <span className={displayLabel ? "truncate" : "truncate text-slate-400"}>
          {displayLabel || placeholder}
        </span>
        <ChevronDown
          className={`${open ? "rotate-180" : ""} h-4 w-4 text-black font-bold`}
        />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full scrollbar-thin  overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="sticky top-0 z-10 border-b border-slate-100 bg-white p-2">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
          </div>
          {value && (
            <button
              type="button"
              onClick={() => commit("")}
              className="block w-full px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-500 hover:bg-slate-50"
            >
              Clear selection
            </button>
          )}
          {allowCustom && query.trim() && !matchesExisting && (
            <button
              type="button"
              onClick={() => commit(query.trim())}
              className="block w-full px-4 py-2 text-left text-sm font-bold text-blue-700 hover:bg-blue-50"
            >
              Use “{query.trim()}”
            </button>
          )}
          {filtered.length === 0 && !allowCustom && (
            <div className="px-4 py-3 text-sm text-slate-500">{emptyText}</div>
          )}
          {filtered.slice(0, maxOptions).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => commit(option.value)}
              className={`block w-full px-4 py-2 text-left text-sm hover:bg-slate-50 ${option.value === value ? "bg-slate-50 font-bold" : ""}`}
            >
              <span className="block truncate">{option.label}</span>
              {option.sublabel ? (
                <span className="block truncate text-xs text-slate-500">
                  {option.sublabel}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Button({
  children,
  className = "rounded-lg px-2 py-3 lg:px-4 lg:py-3 text-base lg:text-sm",
  ...props
}: any) {
  return (
    <button
      {...props}
      className={`rounded-lg bg-brand ${className} font-bold text-brand-fg disabled:bg-slate-300`}
    >
      {children}
    </button>
  );
}

export function ActionGroup({
  children,
  className = "justify-start",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-nowrap items-center gap-2 whitespace-nowrap ${className}`}
    >
      {children}
    </div>
  );
}

export function ActionButton({
  children,
  tone = "neutral",
  className = "rounded-lg border px-3 text-[10px] lg:text-xs",
  ...props
}: any) {
  const tones: any = {
    neutral: "border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
    primary: "border-brand bg-brand text-brand-fg hover:bg-brand-hover",
    danger:
      "border-danger-border bg-white text-danger-fg hover:bg-danger-subtle",
  };
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-9 shrink-0 items-center justify-center font-bold disabled:border-slate-200 disabled:bg-white disabled:text-slate-300 ${tones[tone] || tones.neutral} ${className}`}
    >
      {children}
    </button>
  );
}

// Reusable refresh control for list/table headers. `onRefresh` may be sync or
// async; the icon spins while an async refresh is in flight.
export function RefreshButton({
  onRefresh,
  title = "Refresh",
  label,
  className = "",
}: {
  onRefresh: () => void | Promise<unknown>;
  title?: string;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  async function handleClick() {
    if (busy) return;
    try {
      setBusy(true);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title={title}
      aria-label={title}
      className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] lg:text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:text-slate-300 ${className}`}
    >
      <RefreshCw className={`h3.5 w-3.5  ${busy ? "animate-spin" : ""}`} />
      {label ? <span>{label}</span> : null}
    </button>
  );
}
