import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/app/components/common/ui";

/**
 * A write-only credential field with a show/hide toggle.
 *
 * Note the full class list: Input's `className` replaces its default styling
 * rather than merging with it, so passing only `pr-11` here would strip the
 * padding and font sizing every other field has.
 */
export function SecretInput({
  value,
  onChange,
  placeholder,
  visible,
  toggleVisible,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  visible: boolean;
  toggleVisible: () => void;
  label: string;
}) {
  return (
    <div className="relative w-full">
      <Input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event: any) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="new-password"
        className="w-full rounded-lg px-2 py-2 pr-11 text-xs placeholder:text-xs lg:py-2.5 lg:pr-11 lg:text-xs"
      />
      <button
        type="button"
        onClick={toggleVisible}
        aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition hover:text-slate-700"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
