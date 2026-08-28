function ProfileRow({ icon: Icon, label, value, action, wrap = false }: any) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50">
      {Icon && (
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-success-subtle text-brand">
          <Icon size={16} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
          {label}
        </span>
        <div className="mt-0.5 flex min-w-0 items-start gap-1.5">
          <span
            className={`${wrap ? "whitespace-normal break-words" : "truncate"} min-w-0 font-semibold text-slate-700`}
          >
            {value || "-"}
          </span>
          {action}
        </div>
      </div>
    </div>
  );
}

export default ProfileRow
