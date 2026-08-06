import { Skeleton } from "./Skeleton";

export function AppHeaderSkeleton() {
  return (
    <header
      className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:px-5"
      role="status"
      aria-busy="true"
      aria-label="Loading page header"
    >
      <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-[minmax(200px,1.15fr)_minmax(150px,.8fr)_minmax(220px,1fr)_auto] lg:grid-cols-[minmax(260px,1.15fr)_minmax(180px,.8fr)_minmax(280px,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-2 h-6 w-40" />
        </div>
        <div>
          <Skeleton className="h-3 w-14" />
          <Skeleton className="mt-2 h-10 w-full rounded-xl" />
        </div>
        <div>
          <Skeleton className="h-3 w-14" />
          <Skeleton className="mt-2 h-10 w-full rounded-xl" />
        </div>
        <div className="flex shrink-0 items-center gap-2 mt-3 lg:mt-0">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
      </div>
      <span className="sr-only">Loading page header</span>
    </header>
  );
}
