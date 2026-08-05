import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RowActionsProps } from "../types";
import { MoreHorizontal } from "lucide-react";

const MENU_WIDTH_PX: Record<string, number> = {
  "w-24": 96,
  "w-28": 112,
  "w-32": 128,
  "w-36": 144,
  "w-40": 160,
  "w-48": 192,
};

export function RowActions({
  actions,
  width = "w-24",
  className,
}: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const visibleActions = actions.filter((action) => !action.hidden);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);

    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function positionMenu() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = MENU_WIDTH_PX[width] ?? 96;
      const menuHeight = visibleActions.length * 32 + 8;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow >= menuHeight || rect.top < menuHeight
          ? rect.bottom + 4
          : Math.max(rect.top - menuHeight - 4, 8);
      const left = Math.min(
        Math.max(rect.right - menuWidth, 8),
        window.innerWidth - menuWidth - 8,
      );
      setMenuPosition({ left, top });
    }

    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open, visibleActions.length, width]);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open actions"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ left: menuPosition.left, top: menuPosition.top }}
            className={`fixed z-[1000] ${width} rounded-lg border bg-white py-1 shadow-lg ${className ?? ""}`}
          >
            {visibleActions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  action.onClick();
                  setOpen(false);
                }}
                className={`block w-full px-4 py-1 text-left text-sm ${
                  action.disabled
                    ? "cursor-not-allowed text-slate-300"
                    : `hover:bg-slate-100 ${
                        action.danger ? "text-red-600 hover:bg-red-50" : ""
                      }`
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
