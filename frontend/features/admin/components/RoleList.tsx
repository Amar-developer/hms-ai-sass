export function RoleList({ labels }: { labels: string[] }) {
  if (!labels.length) return <span className="text-slate-400">-</span>;
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {labels.map((label) => (
        <span
          key={label}
          className="max-w-full truncate rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
          title={labels.join(", ")}
        >
          {label}
        </span>
      ))}
    </span>
  );
}
