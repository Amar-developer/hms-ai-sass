import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RowActionsProps } from "../types";
import { MoreHorizontal } from "lucide-react";

export function RowActions({
  actions,
  width = "w-24",
}: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const visibleActions = actions.filter((action) => !action.hidden);

  function toggleMenu() {
    if (open) {
      setOpen(false);
      return;
    }
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const widthPixels = width === "w-48" ? 192 : width === "w-36" ? 144 : 96;
    const estimatedHeight = visibleActions.length * 32 + 16;
    const below = rect.bottom + 4;
    const top =
      below + estimatedHeight <= window.innerHeight - 8
        ? below
        : Math.max(8, rect.top - estimatedHeight - 4);
    const left = Math.min(
      Math.max(8, rect.right - widthPixels),
      window.innerWidth - widthPixels - 8,
    );
    setPosition({ top, left });
    setOpen(true);
  }

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

    function closeMenu() {
      setOpen(false);
    }

    document.addEventListener("mousedown", handleClick);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, []);

  return (
    <div
      ref={menuRef}
      className="relative"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open actions"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={toggleMenu}
        className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: position.top, left: position.left }}
            className={`fixed ${width} rounded-lg border bg-white py-1 shadow-lg z-[1000]`}
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
                className={`block w-full px-4 py-1 text-left ${
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
