import { useEffect, useMemo, useRef, useState } from "react";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}
export function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "red" | "green" | "blue" | "amber" | "purple";
}) {
  const m: any = {
    slate: "bg-slate-100 text-slate-700",
    red: "bg-red-100 text-red-700",
    green: "bg-emerald-100 text-emerald-700",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
    purple: "bg-purple-100 text-purple-700",
  };
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${m[tone]}`}
    >
      {children}
    </span>
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
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
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
export function Input({ className = "", onKeyDown, ...props }: any) {
  return (
    <input
      {...props}
      onKeyDown={(event: any) => {
        onKeyDown?.(event);
        if (
          event.defaultPrevented ||
          event.key !== "Enter" ||
          event.shiftKey ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.nativeEvent?.isComposing ||
          props.type === "button" ||
          props.type === "checkbox" ||
          props.type === "file" ||
          props.type === "radio" ||
          props.type === "range"
        )
          return;
        event.preventDefault();
        submitNearestFormOnEnter(event);
      }}
      className={`w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-500 ${className}`}
    />
  );
}
export function Select(props: any) {
  return (
    <select
      {...props}
      className={`w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500 ${props.className || ""}`}
    >
      {props.children}
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
        (option.sublabel || "").toLowerCase().includes(trimmed)
    );
  }, [options, query]);

  const selected = options.find((option) => option.value === value);
  const displayLabel = selected?.label || (value && allowCustom ? value : "");
  const matchesExisting = filtered.some(
    (option) => option.value === query.trim()
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
        className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm outline-none focus:border-slate-500 disabled:bg-slate-50 disabled:text-slate-400"
      >
        <span
          className={displayLabel ? "truncate" : "truncate text-slate-400"}
        >
          {displayLabel || placeholder}
        </span>
        <span className="ml-2 text-xs text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
          <div className="sticky top-0 z-10 border-b border-slate-100 bg-white p-2">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
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
export function Button({ children, className = "", ...props }: any) {
  return (
    <button
      {...props}
      className={`rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300 ${className}`}
    >
      {children}
    </button>
  );
}
export function ActionGroup({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-nowrap items-center justify-end gap-2 whitespace-nowrap ${className}`}
    >
      {children}
    </div>
  );
}
export function ActionButton({
  children,
  tone = "neutral",
  className = "",
  ...props
}: any) {
  const tones: any = {
    neutral: "border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
    primary: "border-slate-900 bg-slate-900 text-white hover:bg-slate-800",
    danger: "border-red-100 bg-white text-red-600 hover:bg-red-50",
  };
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-9 shrink-0 items-center justify-center rounded-xl border px-3 text-xs font-bold disabled:border-slate-200 disabled:bg-white disabled:text-slate-300 ${tones[tone] || tones.neutral} ${className}`}
    >
      {children}
    </button>
  );
}
