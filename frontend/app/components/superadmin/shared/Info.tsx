"use client";

export function Info({ label, value }: any) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <p className="text-xs lg:text-sm font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xs lg:text-sm font-bold">{value}</p>
    </div>
  );
}
