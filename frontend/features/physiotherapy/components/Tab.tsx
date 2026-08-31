export function Tab({ active, onClick, children }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`save-button font-bold ${active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
    >
      {children}
    </button>
  );
}
