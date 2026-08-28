import type { ComponentType, MutableRefObject } from "react";

export type StatusTabItem = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  // Omit entirely for a tab that never shows a count badge (e.g. plain
  // section tabs). A defined count (including 0) always renders a badge
  // unless `hideZeroCount` says otherwise.
  count?: number;
};

type StatusTabsNavProps = {
  tabs: StatusTabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
  // Hide the badge instead of showing "0" — for "pending work" counts
  // (OPD) where zero means nothing to flag, as opposed to worklist counts
  // (Lab, Pharmacy, ...) where an empty bucket is still worth showing.
  hideZeroCount?: boolean;
  // Keep every tab's badge slot the same width even when its badge is
  // hidden, so tab widths don't shift as counts change — used by OPD,
  // where several tabs' counts toggle between 0 and >0 while browsing.
  reserveBadgeSpace?: boolean;
  badgeActiveClassName?: string;
  badgeInactiveClassName?: string;
  // Lets a caller (OPD) capture each tab's button node, e.g. to scroll the
  // active tab into view.
  tabRefs?: MutableRefObject<Record<string, HTMLButtonElement | null>>;
};

// Horizontally-scrolling status/worklist tab bar with an optional count
// badge per tab — the same markup was hand-duplicated across Lab, Pharmacy,
// Billing, HomeCare, PatientSubscriptions, PatientIntelligenceSettings, OPD,
// and PatientFlow. Callers keep owning their own tab list and count
// computation; this just renders the bar from the resolved
// {id, label, icon, count?} list.
export function StatusTabsNav({
  tabs,
  activeId,
  onSelect,
  ariaLabel,
  hideZeroCount = false,
  reserveBadgeSpace = false,
  badgeActiveClassName = "bg-white/20 text-brand-fg",
  badgeInactiveClassName = "bg-slate-200 text-slate-600",
  tabRefs,
}: StatusTabsNavProps) {
  return (
    <nav
      className="scrollbar-hidden flex gap-1 overflow-x-auto border-t border-slate-200 bg-slate-50 px-3 py-1.5"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeId === tab.id;
        const hasCount = tab.count !== undefined;
        const showBadge = hasCount && (!hideZeroCount || Boolean(tab.count));
        const badge = showBadge && (
          <span
            className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] ${
              active ? badgeActiveClassName : badgeInactiveClassName
            }`}
          >
            {tab.count}
          </span>
        );
        return (
          <button
            key={tab.id}
            ref={
              tabRefs
                ? (node) => {
                    tabRefs.current[tab.id] = node;
                  }
                : undefined
            }
            type="button"
            role="tab"
            aria-selected={active}
            aria-current={active ? "page" : undefined}
            onClick={() => onSelect(tab.id)}
            className={`inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-bold transition-colors ${
              active
                ? "bg-brand text-brand-fg"
                : "text-slate-600 hover:bg-white hover:text-slate-900"
            }`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
            {hasCount &&
              (reserveBadgeSpace ? (
                <span className="grid h-5 w-6 place-items-center">
                  {badge}
                </span>
              ) : (
                badge
              ))}
          </button>
        );
      })}
    </nav>
  );
}
