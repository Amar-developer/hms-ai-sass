"use client";

import { Plus } from "lucide-react";

export function CreateActionButton({ label, onClick }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="primary-action gap-2 px-2 py-2 text-xs shadow-sm lg:w-full lg:px-4 lg:py-3"
    >
      <Plus size={16} />
      <span>{label}</span>
    </button>
  );
}
