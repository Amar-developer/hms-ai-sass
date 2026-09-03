import { isLocked } from "../helpers";

export function CheckboxList({
  title,
  name,
  rows,
  selected,
  valueKey,
  labelKey,
  onRowOpen,
  onSelectionChange,
}: any) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase text-slate-500">{title}</p>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row: any) => {
          const value = row[valueKey];
          const checked = (selected || []).includes(value);
          return (
            <div
              key={row.id}
              role={onRowOpen ? "button" : undefined}
              tabIndex={onRowOpen ? 0 : undefined}
              onClick={() => onRowOpen?.(row)}
              onKeyDown={(event: any) => {
                if (!onRowOpen || (event.key !== "Enter" && event.key !== " "))
                  return;
                event.preventDefault();
                onRowOpen(row);
              }}
              className={`flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-xs ${
                onRowOpen
                  ? "cursor-pointer transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300  border-red-400"
                  : ""
              }`}
            >
              <input
                name={name}
                type="checkbox"
                value={value}
                checked={onSelectionChange ? checked : undefined}
                defaultChecked={onSelectionChange ? undefined : checked}
                onClick={(event) => event.stopPropagation()}
                onChange={(event: any) => {
                  onSelectionChange?.(
                    event.target.checked
                      ? Array.from(new Set([...(selected || []), value]))
                      : (selected || []).filter((item: any) => item !== value),
                  );
                }}
                className=" lg:h-4 lg:w-4 h-5 w-5"
              />
              <span className="flex items-center gap-1 h-full">
                <b className="md:text-sm lg:text-xs">{row[labelKey]}</b>
                {row.branchLabel && (
                  <span className="block text-xs text-slate-500">
                    {row.branchLabel}
                  </span>
                )}
                {isLocked(row) && (
                  <span className=" inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700">
                    Template
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
