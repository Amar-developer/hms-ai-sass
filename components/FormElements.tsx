"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// ─── Shared Types ────────────────────────────────────────────────────────────

export type SelectOption = { value: string; label: string; sublabel?: string };

type BaseFieldProps = {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

function inputBorder(error?: string) {
  return error
    ? "border-red-400 focus:border-red-500"
    : "border-slate-200 focus:border-slate-500";
}

// ─── FormField ────────────────────────────────────────────────────────────────
// Layout wrapper: label + children + inline error/hint.
// Use this when composing a custom input that needs label+error layout.

export function FormField({
  label,
  error,
  hint,
  required,
  children,
  className = "",
}: BaseFieldProps & { children?: React.ReactNode }) {
  return (
    <div className={`block ${className}`}>
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      {children}
      {error ? (
        <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

// ─── TextField ────────────────────────────────────────────────────────────────

type TextFieldProps = BaseFieldProps & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "url" | "search";
  autoComplete?: string;
  maxLength?: number;
};

export function TextField({
  label, error, hint, required, disabled, className,
  value, onChange, placeholder, type = "text", autoComplete, maxLength,
}: TextFieldProps) {
  return (
    <FormField label={label} error={error} hint={hint} required={required} className={className}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        maxLength={maxLength}
        className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none disabled:bg-slate-50 disabled:text-slate-400 ${inputBorder(error)}`}
      />
    </FormField>
  );
}

// ─── PasswordField ────────────────────────────────────────────────────────────

type PasswordFieldProps = BaseFieldProps & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
};

export function PasswordField({
  label, error, hint, required, disabled, className,
  value, onChange, placeholder, autoComplete,
}: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  return (
    <FormField label={label} error={error} hint={hint} required={required} className={className}>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          className={`w-full rounded-2xl border px-4 py-3 pr-14 text-sm outline-none disabled:bg-slate-50 disabled:text-slate-400 ${inputBorder(error)}`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          disabled={disabled}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-700 disabled:opacity-50"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </FormField>
  );
}

// ─── NumberField ──────────────────────────────────────────────────────────────

type NumberFieldProps = BaseFieldProps & {
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
};

export function NumberField({
  label, error, hint, required, disabled, className,
  value, onChange, placeholder, min, max, step,
}: NumberFieldProps) {
  return (
    <FormField label={label} error={error} hint={hint} required={required} className={className}>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none disabled:bg-slate-50 disabled:text-slate-400 ${inputBorder(error)}`}
      />
    </FormField>
  );
}

// ─── DateField ────────────────────────────────────────────────────────────────

type DateFieldProps = BaseFieldProps & {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
};

export function DateField({
  label, error, hint, required, disabled, className,
  value, onChange, min, max,
}: DateFieldProps) {
  return (
    <FormField label={label} error={error} hint={hint} required={required} className={className}>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none disabled:bg-slate-50 disabled:text-slate-400 ${inputBorder(error)}`}
      />
    </FormField>
  );
}

// ─── TimeField ────────────────────────────────────────────────────────────────

type TimeFieldProps = BaseFieldProps & {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
};

export function TimeField({
  label, error, hint, required, disabled, className,
  value, onChange, min, max,
}: TimeFieldProps) {
  return (
    <FormField label={label} error={error} hint={hint} required={required} className={className}>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none disabled:bg-slate-50 disabled:text-slate-400 ${inputBorder(error)}`}
      />
    </FormField>
  );
}

// ─── TextareaField ────────────────────────────────────────────────────────────

type TextareaFieldProps = BaseFieldProps & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
};

export function TextareaField({
  label, error, hint, required, disabled, className,
  value, onChange, placeholder, rows = 3, maxLength,
}: TextareaFieldProps) {
  return (
    <FormField label={label} error={error} hint={hint} required={required} className={className}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        rows={rows}
        maxLength={maxLength}
        className={`w-full resize-y rounded-2xl border px-4 py-3 text-sm outline-none disabled:bg-slate-50 disabled:text-slate-400 ${inputBorder(error)}`}
      />
    </FormField>
  );
}

// ─── SelectField ──────────────────────────────────────────────────────────────

type SelectFieldProps = BaseFieldProps & {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
};

export function SelectField({
  label, error, hint, required, disabled, className,
  value, onChange, options, placeholder,
}: SelectFieldProps) {
  return (
    <FormField label={label} error={error} hint={hint} required={required} className={className}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        className={`w-full rounded-2xl border bg-white px-4 py-3 text-sm outline-none disabled:bg-slate-50 disabled:text-slate-400 ${inputBorder(error)}`}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}

// ─── SearchableSelectField ────────────────────────────────────────────────────
// Searchable dropdown with keyboard-accessible option list, sublabels, and
// optional free-text entry via allowCustom.

type SearchableSelectFieldProps = BaseFieldProps & {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  allowCustom?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  maxOptions?: number;
};

export function SearchableSelectField({
  label, error, hint, required, disabled, className,
  value, onChange, options,
  placeholder = "Select...",
  allowCustom = false,
  searchPlaceholder = "Search...",
  emptyText = "No matches.",
  maxOptions = 200,
}: SearchableSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        String(o.value).toLowerCase().includes(q) ||
        (o.sublabel || "").toLowerCase().includes(q)
    );
  }, [options, query]);

  const selected = options.find((o) => o.value === value);
  const displayLabel = selected?.label || (value && allowCustom ? value : "");
  const exactMatch = filtered.some((o) => o.value === query.trim());

  function commit(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  const triggerBorder = error
    ? "border-red-400"
    : "border-slate-200";

  return (
    <FormField label={label} error={error} hint={hint} required={required} className={className}>
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((c) => !c)}
          className={`flex w-full items-center justify-between rounded-2xl border bg-white px-4 py-3 text-left text-sm outline-none focus:border-slate-500 disabled:bg-slate-50 disabled:text-slate-400 ${triggerBorder}`}
        >
          <span className={displayLabel ? "truncate" : "truncate text-slate-400"}>
            {displayLabel || placeholder}
          </span>
          <span className="ml-2 shrink-0 text-xs text-slate-400">
            {open ? "▲" : "▼"}
          </span>
        </button>

        {open && (
          <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
            <div className="sticky top-0 z-10 border-b border-slate-100 bg-white p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
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

            {allowCustom && query.trim() && !exactMatch && (
              <button
                type="button"
                onClick={() => commit(query.trim())}
                className="block w-full px-4 py-2 text-left text-sm font-bold text-blue-700 hover:bg-blue-50"
              >
                Use &quot;{query.trim()}&quot;
              </button>
            )}

            {filtered.length === 0 && !allowCustom && (
              <div className="px-4 py-3 text-sm text-slate-500">{emptyText}</div>
            )}

            {filtered.slice(0, maxOptions).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => commit(opt.value)}
                className={`block w-full px-4 py-2 text-left text-sm hover:bg-slate-50 ${
                  opt.value === value ? "bg-slate-50 font-bold" : ""
                }`}
              >
                <span className="block truncate">{opt.label}</span>
                {opt.sublabel && (
                  <span className="block truncate text-xs text-slate-500">
                    {opt.sublabel}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </FormField>
  );
}

// ─── CheckboxField ────────────────────────────────────────────────────────────

type CheckboxFieldProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
};

export function CheckboxField({
  label, checked, onChange, error, hint, disabled, className = "",
}: CheckboxFieldProps) {
  return (
    <div className={`block ${className}`}>
      <label className={`flex cursor-pointer items-center gap-3 ${disabled ? "opacity-60" : ""}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded border-slate-300 accent-slate-900"
        />
        <span className="text-sm text-slate-800">{label}</span>
      </label>
      {error ? (
        <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

// ─── RadioGroupField ──────────────────────────────────────────────────────────

type RadioOption = { value: string; label: string };

type RadioGroupFieldProps = BaseFieldProps & {
  value: string;
  onChange: (value: string) => void;
  options: RadioOption[];
  direction?: "row" | "col";
};

export function RadioGroupField({
  label, error, hint, required, disabled, className,
  value, onChange, options, direction = "col",
}: RadioGroupFieldProps) {
  return (
    <FormField label={label} error={error} hint={hint} required={required} className={className}>
      <div
        className={`flex gap-4 ${direction === "row" ? "flex-row flex-wrap" : "flex-col"}`}
      >
        {options.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-center gap-2 ${disabled ? "opacity-60" : ""}`}
          >
            <input
              type="radio"
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              disabled={disabled}
              className="h-4 w-4 border-slate-300 accent-slate-900"
            />
            <span className="text-sm text-slate-800">{opt.label}</span>
          </label>
        ))}
      </div>
    </FormField>
  );
}

// ─── TagInputField ────────────────────────────────────────────────────────────
// Free-text tag entry: press Enter or comma to add a tag, × to remove.

type TagInputFieldProps = BaseFieldProps & {
  tags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (index: number) => void;
  placeholder?: string;
};

export function TagInputField({
  label, error, hint, required, disabled, className,
  tags, onAddTag, onRemoveTag, placeholder,
}: TagInputFieldProps) {
  const [draft, setDraft] = useState("");

  function commitDraft() {
    const text = draft.trim();
    if (!text || disabled) return;
    onAddTag(text);
    setDraft("");
  }

  const containerBorder = error
    ? "border-red-400 focus-within:border-red-500"
    : "border-slate-200 focus-within:border-slate-500";

  return (
    <FormField label={label} error={error} hint={hint} required={required} className={className}>
      <div
        className={`flex min-h-14 w-full flex-wrap items-start gap-2 rounded-2xl border px-3 py-2 text-sm ${containerBorder} ${
          disabled ? "bg-slate-50" : "bg-white"
        }`}
      >
        {tags.map((tag, i) => (
          <div
            key={`${tag}-${i}`}
            className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-800"
          >
            <span>{tag}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => onRemoveTag(i)}
                className="ml-1 text-base leading-none text-slate-400 hover:text-red-500"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {!disabled && (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent?.isComposing || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                commitDraft();
              }
            }}
            onBlur={commitDraft}
            placeholder={tags.length === 0 ? placeholder : ""}
            className="min-w-32 flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none"
          />
        )}
      </div>
    </FormField>
  );
}

// ─── FormErrorBanner ──────────────────────────────────────────────────────────
// Form-level error message (e.g. API errors, submit failures).

export function FormErrorBanner({
  error,
  className = "",
}: {
  error: string;
  className?: string;
}) {
  if (!error) return null;
  return (
    <div
      className={`rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700 ${className}`}
    >
      {error}
    </div>
  );
}

// ─── FormSuccessBanner ────────────────────────────────────────────────────────

export function FormSuccessBanner({
  message,
  className = "",
}: {
  message: string;
  className?: string;
}) {
  if (!message) return null;
  return (
    <div
      className={`rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 ${className}`}
    >
      {message}
    </div>
  );
}
