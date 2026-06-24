"use client";

import { Plus } from "lucide-react";

export function CreateActionButton({ label, onClick }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 bg-slate-900 rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:w-full font-bold text-white shadow-sm transition hover:bg-slate-800"
    >
      <Plus size={16} />
      <span>{label}</span>
    </button>
  );
}
