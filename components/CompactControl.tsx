function CompactControl({ label, children }: any) {
  return (
    <label
      className={`grid min-w-0 content-center rounded-xl border border-slate-200 bg-white px-3 py-2 h-12 md:h-12 lg:h-14 ${label=="Tenant"? 'mt-3':''}`}
    >
      <span
        className="text-[10px] font-bold uppercase leading-none text-slate-500 lg:text-xs"
      >
        {label}
      </span>

      <span
        className="text-[10px] mt-1 min-w-0 truncate  font-semibold text-slate-800 lg:text-sm"
      >
        {children}
      </span>
    </label>
  );
}

export default CompactControl;
