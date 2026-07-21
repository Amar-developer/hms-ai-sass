export function Tab({
  active,
  onClick,
  children,
  className = "rounded-lg px-4 py-3 text-sm",
}: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${className} font-bold ${active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
    >
      {children}
    </button>
  );
}
