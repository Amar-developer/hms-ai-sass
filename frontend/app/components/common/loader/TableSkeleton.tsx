interface Props {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
}

export function TableSkeleton({
  rows = 8,
  columns = 5,
  showHeader = false,
}: Props) {
  const safeColumns = Math.max(1, Math.min(columns, 10));
  const gridStyle = {
    gridTemplateColumns: `repeat(${safeColumns}, minmax(0, 1fr))`,
  };

  return (
    <div
      className="min-w-[720px] animate-pulse"
      role="status"
      aria-label="Loading table"
    >
      {showHeader && (
        <div
          className="grid h-10 items-center gap-4 bg-slate-50 px-4"
          style={gridStyle}
        >
          {Array.from({ length: safeColumns }).map((_, column) => (
            <div key={column} className="h-3 w-3/5 rounded bg-slate-200" />
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="grid h-10 items-center gap-4 border-t border-slate-100 px-4 first:border-t-0"
          style={gridStyle}
        >
          {Array.from({ length: safeColumns }).map((__, column) => (
            <div
              key={column}
              className={`h-3 rounded ${column === 0 ? "w-4/5 bg-slate-200" : "w-3/5 bg-slate-100"}`}
            />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading table</span>
    </div>
  );
}
