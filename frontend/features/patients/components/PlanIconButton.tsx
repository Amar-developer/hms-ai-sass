export function PlanIconButton({
  children,
  tone = "slate",
  className = "",
  ...props
}: any) {
  const tones: any = {
    slate: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    amber: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
    green: "border-green-200 bg-green-50 text-green-800 hover:bg-green-100",
    red: "border-red-200 bg-white text-red-600 hover:bg-red-50",
  };
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${tones[tone] || tones.slate} ${className}`}
    >
      {children}
    </button>
  );
}
