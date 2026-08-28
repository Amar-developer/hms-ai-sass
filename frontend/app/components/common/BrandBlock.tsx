import { HeartPulse } from "lucide-react";
type BrandBlockProps = {
  compact?: boolean;
  tabletCollapsed: boolean;
  setTabletCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sideBarOpen:boolean
};

export function BrandBlock({
  compact = false,
  tabletCollapsed,
  setTabletCollapsed,
  setSidebarOpen,
  sideBarOpen
}: BrandBlockProps) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <button
        type="button"
        aria-label="Toggle navigation"
        onClick={() => {
          if (window.innerWidth >= 1024) return;
          setTabletCollapsed(!tabletCollapsed);
          // setSidebarOpen(!sideBarOpen)
        }}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand text-brand-fg transition hover:bg-brand-hover"
      >
        <HeartPulse size={22} />
      </button>

      {!compact && !tabletCollapsed && (
        <div className="min-w-0">
          <h1 className="truncate text-sm font-black text-slate-950">MedizinHub HMS</h1>
          <p className="truncate text-xs text-slate-500">
            Healthcare Workspace
          </p>
        </div>
      )}
    </div>
  );
}
