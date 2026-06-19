function CompactControl({ label, children, hideLabel = false }: any) {
  return (
    <label
      className={`grid min-w-0 content-center rounded-lg border border-slate-200 bg-white px-3 ${hideLabel ? "h-11 py-1" : "h-11 py-1.5"} mt-3`}
    >
      <span
        className={`${hideLabel ? "sr-only" : "text-[10px] font-bold uppercase leading-none text-slate-500"}`}
      >
        {label}
      </span>

      <span
        className={`${hideLabel ? "" : "mt-1"} min-w-0 truncate text-xs   font-semibold text-slate-800`}
      >
        {children}
      </span>
    </label>
  );
}

export default CompactControl;
