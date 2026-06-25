import { HeartPulse } from "lucide-react";
type BrandBlockProps = {
  compact?: boolean;
  tabletCollapsed: boolean;
  setTabletCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sideBarOpen:boolean
};

export function BrandBlock({
  tabletCollapsed,
  setTabletCollapsed,
  setSidebarOpen,
  sideBarOpen
}: BrandBlockProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => {
          if (window.innerWidth >= 1024) return;
          setTabletCollapsed(!tabletCollapsed);
          // setSidebarOpen(!sideBarOpen)
        }}
        className="rounded-lg bg-slate-900 p-3 text-white"
      >
        <HeartPulse size={24} />
      </button>

      {!tabletCollapsed && (
        <div className="min-w-0">
          <h1 className="text-sm font-bold">MedizinHub HMS</h1>
          <p className="truncate text-xs text-slate-500">
            Healthcare SaaS Workspace
          </p>
        </div>
      )}
    </div>
  );
}
