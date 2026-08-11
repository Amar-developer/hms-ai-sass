import { useEffect, useRef, useState } from "react";
import { RowActionsProps } from "../types";
import { MoreHorizontal } from "lucide-react";

const MENU_ITEM_HEIGHT = 32;
const MENU_VERTICAL_PADDING = 16;

export function RowActions({
  actions,
  width = "w-24",
  className,
}: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const visibleActions = actions.filter((action) => !action.hidden);

  function toggleOpen() {
    if (!open && triggerRef.current) {
      const estimatedMenuHeight =
        visibleActions.length * MENU_ITEM_HEIGHT + MENU_VERTICAL_PADDING;
      const spaceBelow =
        window.innerHeight - triggerRef.current.getBoundingClientRect().bottom;
      setOpenUpward(spaceBelow < estimatedMenuHeight);
    }
    setOpen((prev) => !prev);
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
        onClick={toggleOpen}
        className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-[1000] ${width} rounded-lg border bg-white py-1 shadow-lg ${className ?? "right-0 top-full mt-1"}`}
          style={
            openUpward
              ? { top: "auto", bottom: "18%", marginTop: 0, marginBottom: 4 }
              : { bottom: "auto", top: "18%", marginBottom: 0, marginTop: 4 }
          }
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
        </div>
      )}
    </div>
  );
}
