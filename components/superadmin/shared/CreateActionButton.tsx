"use client";

import { Plus } from "lucide-react";

export function CreateActionButton({ label, onClick }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
    >
      <Plus size={16} />
      <span>{label}</span>
    </button>
  );
}
