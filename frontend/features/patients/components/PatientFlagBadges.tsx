import type {
  PatientIntelligenceFlagCompact,
  PatientReference,
} from "@/lib/contracts";

export function patientValueTierFlags(
  flags: PatientIntelligenceFlagCompact[] | null | undefined,
) {
  return [...(flags || [])]
    .filter(
      (flag) =>
        flag.label &&
        flag.background_color &&
        flag.text_color &&
        flag.border_color,
    )
    .sort((left, right) => (left.priority ?? 100) - (right.priority ?? 100));
}

export function patientFlagLabel(flagKey: string) {
  return flagKey
    .replace(/_PATIENT$/, "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function patientFlagBadgeData(flag: PatientIntelligenceFlagCompact) {
  return {
    label: flag.label || patientFlagLabel(flag.flag_key),
    title: flag.explanation || patientFlagLabel(flag.flag_key),
    className: "",
    style: {
      backgroundColor: flag.background_color,
      color: flag.text_color,
      borderColor: flag.border_color,
    },
  };
}

export function PatientFlagBadges({
  patient,
  flags,
  maxVisible = 3,
  className = "",
  inverse = false,
}: {
  patient?: PatientReference | null | any;
  flags?: PatientIntelligenceFlagCompact[];
  maxVisible?: number;
  className?: string;
  inverse?: boolean;
}) {
  const rows = patientValueTierFlags(flags || patient?.intelligence_flags);
  if (!rows.length) return null;
  const visible = rows.slice(0, maxVisible);
  return (
    <span className={`flex flex-wrap items-center gap-1 ${className}`}>
      {visible.map((flag) => {
        const badge = patientFlagBadgeData(flag);
        return (
          <span
            key={flag.flag_key}
            title={badge.title}
            style={inverse ? undefined : badge.style}
            className={`inline-flex whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none ${
              inverse ? "border-white/30 bg-white/10 text-white" : badge.className
            }`}
          >
            {badge.label}
          </span>
        );
      })}
      {rows.length > maxVisible && (
        <span
          title={rows.slice(maxVisible).map((flag) => patientFlagLabel(flag.flag_key)).join(", ")}
          className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none ${
            inverse
              ? "border-white/30 bg-white/10 text-white"
              : "border-slate-300 bg-white text-slate-600"
          }`}
        >
          +{rows.length - maxVisible}
        </span>
      )}
    </span>
  );
}
