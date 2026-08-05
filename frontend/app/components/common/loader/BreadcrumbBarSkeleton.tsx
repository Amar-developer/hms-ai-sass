import { Skeleton } from "./Skeleton";

export function BreadcrumbBarSkeleton() {
  return (
    <div
      className="bg-white px-4 py-2 lg:px-6"
      role="status"
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="flex min-w-0 flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Skeleton className="h-7 w-16 rounded-xl" />
          <span className="h-5 w-px bg-slate-200" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-8 w-40 rounded-lg" />
      </div>
      <span className="sr-only">Loading page</span>
    </div>
  );
}
