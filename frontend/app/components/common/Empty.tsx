"use client";

export function Empty({ text }: any) {
  return (
    <div className="rounded-lg bg-slate-50 p-4 text-xs lg:text-sm text-slate-500">
      {text}
    </div>
  );
}
