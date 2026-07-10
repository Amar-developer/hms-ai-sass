import { splitListText } from "../helpers";

export function ClinicalItemList({
  value,
  items: providedItems,
  empty = "-",
}: any) {
  const items = providedItems || splitListText(value);
  if (items.length === 0) return <p className="mt-1 text-slate-700">{empty}</p>;
  return (
    <div className="mt-2 space-y-1.5">
      {items.map((item: string, index: number) => (
        <div
          key={`${item}-${index}`}
          className="rounded-xl bg-white/70 px-3 py-2 text-sm leading-relaxed text-slate-700"
        >
          {item}
        </div>
      ))}
    </div>
  );
}
