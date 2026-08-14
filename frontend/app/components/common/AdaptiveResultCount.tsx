"use client";

type AdaptiveResultCountProps = {
  shown: number;
  total: number;
  noun?: string;
};

// "Showing X of Y" — X is what's actually visible after search/quick
// filters/ad-hoc query filters narrow the page, Y is the module's total
// record count. Lives next to Filters/Sort/Refresh in the breadcrumb row so
// every module reports this the same way, in the same place.
export function AdaptiveResultCount({
  shown,
  total,
  noun = "items",
}: AdaptiveResultCountProps) {
  return (
    <span className="whitespace-nowrap text-[11px] font-bold text-slate-500">
      Showing {shown} of {total} {noun}
    </span>
  );
}
