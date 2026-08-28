import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type SettingsWorkspaceTab<T extends string> = {
  id: T;
  label: string;
  icon: LucideIcon;
  count?: number;
};

export function SettingsWorkspaceHeader<T extends string>({
  icon: HeaderIcon,
  title,
  description,
  tabs,
  activeTab,
  onTabChange,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  tabs: SettingsWorkspaceTab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  actions?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-brand">
            <HeaderIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-black tracking-tight text-slate-950">
              {title}
            </h2>
            <p className="text-xs font-medium text-slate-500">{description}</p>
          </div>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>

      <nav
        className="scrollbar-hidden flex gap-1 overflow-x-auto border-t border-slate-200 bg-slate-50 px-3 py-1.5"
        aria-label={`${title} sections`}
        role="tablist"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(tab.id)}
              className={`inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-bold transition-colors ${
                active
                  ? "bg-brand text-brand-fg"
                  : "text-slate-600 hover:bg-white hover:text-slate-900"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              {typeof tab.count === "number" && (
                <span
                  className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] ${
                    active
                      ? "bg-white/20 text-brand-fg"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </section>
  );
}
