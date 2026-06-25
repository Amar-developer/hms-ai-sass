function ProfileRow({ label, value }: any) {
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-2">
      <span className="font-bold uppercase text-slate-400">{label}</span>
      <span className="truncate font-semibold text-slate-700">
        {value || "-"}
      </span>
    </div>
  );
}

export default ProfileRow
