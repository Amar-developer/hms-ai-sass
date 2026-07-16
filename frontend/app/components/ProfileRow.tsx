function ProfileRow({ label, value, action, wrap = false }: any) {
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-2">
      <span className="font-bold uppercase text-slate-400">{label}</span>
      <div className="flex min-w-0 items-start gap-1.5">
        <span
          className={`${wrap ? "whitespace-normal break-words" : "truncate"} min-w-0 font-semibold text-slate-700`}
        >
          {value || "-"}
        </span>
        {action}
      </div>
    </div>
  );
}

export default ProfileRow
