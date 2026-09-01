"use client";

import { PlusCircle } from "lucide-react";
import { Button } from "@/app/components/common/ui";

export function CreateActionButton({ label, onClick }: any) {
  return (
    <Button
      type="button"
      onClick={onClick}
      className="primary-action gap-2 p-3 text-xs w-auto shadow-sm "
    >
      <PlusCircle size={16} />
      <span>{label}</span>
    </Button>
  );
}
