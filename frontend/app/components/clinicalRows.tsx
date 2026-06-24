"use client";

import { useState } from "react";
import { Input } from "@/app/components/common/ui";

export const medicineFrequencyOptions = [
  "1-0-0",
  "0-1-0",
  "0-0-1",
  "1-0-1",
  "1-1-0",
  "0-1-1",
  "1-1-1",
  "OD",
  "BD",
  "TDS",
  "QID",
  "SOS",
  "HS",
];

export const medicineDurationOptions = [
  "1 day",
  "2 days",
  "3 days",
  "5 days",
  "7 days",
  "10 days",
  "14 days",
  "1 week",
  "2 weeks",
  "1 month",
];

export const medicineInstructionOptions = [
  "After food",
  "Before food",
  "With food",
  "Empty stomach",
  "At bedtime",
  "Morning",
  "Night",
  "As needed",
];

export function rowTagLabel(value: any) {
  if (Array.isArray(value)) return value.map((part) => String(part || "").trim()).filter(Boolean).join(" · ");
  if (typeof value === "string") return value.split("|").map((part) => part.trim()).filter(Boolean).join(" · ");
  return "";
}

export function SearchPicker({
  value,
  onChange,
  options,
  placeholder,
  getSearchText,
  onEnterQuery,
  onUseTyped,
  inputValue,
  onInputValueChange,
  disabled = false,
  loading = false,
}: any) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = options.find((row: any) => row.value === value);
  const visibleQuery = inputValue !== undefined ? inputValue : query;
  const search = String(visibleQuery || "").trim().toLowerCase();
  const rows = options.filter((row: any) => {
    if (!search) return true;
    const text = getSearchText ? getSearchText(row.item) : row.label;
    return String(text || row.label).toLowerCase().includes(search);
  });
  const exact = search
    ? rows.find((row: any) => row.label.toLowerCase() === search)
    : undefined;
  const canUseTyped = Boolean((onUseTyped || onEnterQuery) && search && !exact);

  function submitTyped() {
    if (disabled) return;
    const typed = String(visibleQuery || "").trim();
    if (!typed) return;
    if (exact) {
      onChange(exact.value, exact.item);
      onInputValueChange?.(exact.label);
    } else if (onUseTyped) {
      onUseTyped(typed);
    } else {
      onEnterQuery?.(typed, selected);
    }
    if (inputValue === undefined) setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        disabled={disabled}
        className={loading ? "search-input" : "search-input"}
        value={open ? visibleQuery : selected?.label || visibleQuery || ""}
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          if (inputValue === undefined) setQuery("");
        }}
        onChange={(event: any) => {
          if (inputValue === undefined) setQuery(event.target.value);
          onInputValueChange?.(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event: any) => {
          if (
            event.key !== "Enter" ||
            event.shiftKey ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.nativeEvent?.isComposing
          ) {
            return;
          }
          event.preventDefault();
          if (String(visibleQuery || "").trim()) {
            submitTyped();
            return;
          }
          if (onEnterQuery && selected?.label) {
            onEnterQuery(selected.label, selected);
            setOpen(false);
          }
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
      />
      {loading && (
        <span className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600" />
      )}
      {open && !disabled && (
        <div className="absolute z-40 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl">
          {canUseTyped && (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={submitTyped}
              className="mb-1 w-full rounded-xl px-3 py-2 text-left text-sm font-bold hover:bg-slate-50"
            >
              Use “{String(visibleQuery || "").trim()}”
            </button>
          )}
          {rows.length === 0 && !canUseTyped && (
            <div className="px-3 py-3 text-sm text-slate-500">No matching records.</div>
          )}
          {rows.map((row: any) => (
            <button
              key={row.value || "empty"}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(row.value, row.item);
                onInputValueChange?.(row.label);
                if (inputValue === undefined) setQuery("");
                setOpen(false);
              }}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                row.value === value
                  ? "bg-slate-900 text-white hover:bg-slate-900"
                  : ""
              }`}
            >
              {row.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TagEntryBox({
  tags,
  value,
  onChange,
  onSubmit,
  onRemove,
  getLabel = rowTagLabel,
  placeholder,
  disabled = false,
  submitOnComma = true,
  hideInput = false,
  emptyText = "No rows added yet.",
}: any) {
  function submitTag() {
    const text = String(value || "").trim();
    if (!text || disabled) return;
    onSubmit(text);
    onChange("");
  }

  return (
    <div className={`flex min-h-20 w-full flex-wrap items-start gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus-within:border-slate-500 ${disabled ? "opacity-70" : ""}`}>
      {tags.map((tag: any, index: number) => (
        <div
          key={`${getLabel(tag)}-${index}`}
          className="flex max-w-full items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
        >
          <span className="break-words">{getLabel(tag)}</span>
          {!disabled && (
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="ml-1 text-base leading-none text-slate-400 hover:text-red-500"
            >
              ×
            </button>
          )}
        </div>
      ))}
      {hideInput && tags.length === 0 && (
        <span className="px-1 py-2 text-sm text-slate-400">{emptyText}</span>
      )}
      {!disabled && !hideInput && (
        <input
          value={value}
          onChange={(event: any) => onChange(event.target.value)}
          onKeyDown={(event: any) => {
            if (
              event.nativeEvent?.isComposing ||
              event.shiftKey ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey
            ) {
              return;
            }
            if (event.key === "Enter" || (submitOnComma && event.key === ",")) {
              event.preventDefault();
              submitTag();
            }
          }}
          onBlur={submitTag}
          placeholder={tags.length ? "" : placeholder}
          className="min-w-40 flex-1 border-0 bg-transparent px-1 py-2 text-sm outline-none"
        />
      )}
    </div>
  );
}
