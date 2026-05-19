"use client";

import { useState } from "react";
import { Input } from "@/components/ui";

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
  disabled = false,
}: any) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = options.find((row: any) => row.value === value);
  const search = query.trim().toLowerCase();
  const rows = options.filter((row: any) => {
    if (!search) return true;
    const text = getSearchText ? getSearchText(row.item) : row.label;
    return String(text || row.label).toLowerCase().includes(search);
  });

  return (
    <div className="relative">
      <Input
        disabled={disabled}
        value={open ? query : selected?.label || ""}
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          setQuery("");
        }}
        onChange={(event: any) => {
          setQuery(event.target.value);
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
          if (!onEnterQuery || disabled) return;
          const typed = query.trim();
          const exact = typed
            ? rows.find(
                (row: any) => row.label.toLowerCase() === typed.toLowerCase(),
              )
            : undefined;
          onEnterQuery(typed || selected?.label || "", exact || selected);
          setQuery("");
          setOpen(false);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
      />
      {open && !disabled && (
        <div className="absolute z-40 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl">
          {rows.length === 0 && (
            <div className="px-3 py-3 text-sm text-slate-500">
              No matching records.
            </div>
          )}
          {rows.map((row: any) => (
            <button
              key={row.value || "empty"}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(row.value, row.item);
                setQuery("");
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
      {!disabled && (
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
