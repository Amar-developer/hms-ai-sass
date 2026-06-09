import { HeartPulse } from "lucide-react";
type BrandBlockProps = {
  compact?: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export function BrandBlock({
  compact = false,
  setSidebarOpen,
}: BrandBlockProps) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`${compact ? "rounded-xl p-2" : "rounded-2xl p-3"} bg-slate-900 text-white`}
      >
        <HeartPulse size={compact ? 20 : 24} />
      </div>
      <div className="min-w-0">
        <h1 className={`${compact ? "text-base" : "text-sm"} font-bold`}>
          MedizinHub HMS
        </h1>
        <p className="truncate text-xs  lg:text-sm text-slate-500">
          Healthcare SaaS Workspace
        </p>
      </div>
    </div>
  );
}