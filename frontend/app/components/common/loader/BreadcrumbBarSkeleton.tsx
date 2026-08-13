import { Skeleton } from "./Skeleton";

export function BreadcrumbBarSkeleton() {
  return (
    <div
      className="border-b border-slate-100 bg-white px-4 py-1 lg:px-5"
      role="status"
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="flex min-w-0 flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Skeleton className="h-7 w-14 rounded-lg" />
          <span className="h-4 w-px bg-slate-200" />
          <Skeleton className="h-3 w-36" />
        </div>
        <Skeleton className="h-8 w-40 rounded-lg" />
      </div>
      <span className="sr-only">Loading page</span>
    </div>
  );
}
