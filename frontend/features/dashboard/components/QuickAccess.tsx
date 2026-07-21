import { ArrowRight } from "lucide-react";
import { SHORTCUT_CATEGORIES } from "../constants";
import { ShortcutTarget, shortcutTargetId } from "../helpers";

export function QuickAccess({
  enabled,
  setActive,
}: {
  enabled?: (id: string) => boolean;
  setActive?: (target: ShortcutTarget) => void;
}) {
  const visibleCategories = SHORTCUT_CATEGORIES.map((cat) => ({
    ...cat,
    modules: cat.modules.filter(
      (mod) =>
        !enabled ||
        enabled(shortcutTargetId("target" in mod ? mod.target : mod.id)),
    ),
  })).filter((cat) => cat.modules.length > 0);

  if (visibleCategories.length === 0) return null;

  const renderCard = (cat: any, index: number) => (
    <div key={cat.label} className={`rounded-lg border p-4 ${cat.color}`}>
      <p
        className={`mb-3 text-xs font-bold uppercase tracking-wide ${cat.headerColor}`}
      >
        {cat.label}
      </p>

      <div
        className={
          index === 3
            ? "grid grid-flow-col [grid-template-rows:repeat(9,minmax(0,auto))] gap-x-4 gap-y-1"
            : "grid gap-1"
        }
      >
        {cat.modules.map(({ id, label, icon: Icon, ...mod }: any) => (
          <button
            key={id}
            type="button"
            onClick={() => setActive?.("target" in mod ? mod.target : id)}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-white/70 active:scale-[0.98]"
          >
            <Icon size={16} className={cat.iconColor} />
            <span className="flex-1 table-data font-semibold text-slate-800">
              {label}
            </span>
            <ArrowRight size={13} className="text-slate-400" />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-4">
        <h3 className="card-title font-bold">Quick Access</h3>
        <p className="table-data text-slate-500">
          Jump to any module — grouped by function.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-3">
        {visibleCategories
          .slice(0, 3)
          .map((cat, index) => renderCard(cat, index))}
        {visibleCategories[3] && (
          <div className=" md:col-span-2">
            {renderCard(visibleCategories[3], 3)}
          </div>
        )}
        <div className="grid gap-4">
          {visibleCategories
            .slice(4)
            .map((cat, index) => renderCard(cat, index + 4))}
        </div>
        {/* {visibleCategories.map((cat) => (
          <div key={cat.label} className={`rounded-lg border p-4 ${cat.color}`}>
            <p
              className={`mb-3 text-xs font-bold uppercase tracking-wide ${cat.headerColor}`}
            >
              {cat.label}
            </p>
            <div className="grid gap-1">
              {cat.modules.map(({ id, label, icon: Icon, ...mod }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActive?.("target" in mod ? mod.target : id)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-white/70 active:scale-[0.98]"
                >
                  <Icon size={16} className={cat.iconColor} />
                  <span className="flex-1 table-data font-semibold text-slate-800">
                    {label}
                  </span>
                  <ArrowRight size={13} className="text-slate-400" />
                </button>
              ))}
            </div>
          </div>
        ))} */}
      </div>
    </div>
  );
}
