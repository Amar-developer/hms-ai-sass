import { useEffect, useRef, useState } from "react";
import { RowActionsProps } from "../types";
import { MoreHorizontal } from "lucide-react";

export function RowActions({
  actions,
  className = "right-7 -bottom-5",
}: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);

    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div
      ref={menuRef}
      className="relative"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      {open && (
        <div
          className={`absolute ${className}  mb-2 w-24 rounded-lg border bg-white shadow-lg z-50`}
        >
          {actions
            .filter((a) => !a.hidden)
            .map((action) => (
              <button
                key={action.label}
                disabled={action.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  action.onClick();
                  setOpen(false);
                }}
                className={`block w-full px-4 py-1.5 text-left hover:bg-slate-100 ${
                  action.danger ? "text-red-600 hover:bg-red-50" : ""
                }`}
              >
                {action.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
