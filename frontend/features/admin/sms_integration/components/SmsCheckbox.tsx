export function SmsCheckbox({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600"
      />
      <span>
        <span className="block text-xs font-bold text-slate-800">{label}</span>
        {hint && (
          <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>
        )}
      </span>
    </label>
  );
}
