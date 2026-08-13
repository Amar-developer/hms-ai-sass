import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RowActionsProps } from "../types";
import { MoreHorizontal } from "lucide-react";

const MENU_ITEM_HEIGHT = 32;
const MENU_VERTICAL_PADDING = 16;

export function RowActions({
  actions,
  width = "w-24",
  className,
  portal = false,
}: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [portalPosition, setPortalPosition] = useState<{
    top?: number;
    right: number;
    bottom?: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const visibleActions = actions.filter((action) => !action.hidden);

  function toggleOpen() {
    if (!open && triggerRef.current) {
      const estimatedMenuHeight =
        visibleActions.length * MENU_ITEM_HEIGHT + MENU_VERTICAL_PADDING;
      const spaceBelow =
        window.innerHeight - triggerRef.current.getBoundingClientRect().bottom;
      const shouldOpenUpward = spaceBelow < estimatedMenuHeight;
      const triggerRect = triggerRef.current.getBoundingClientRect();
      setOpenUpward(shouldOpenUpward);
      if (portal) {
        setPortalPosition(
          shouldOpenUpward
            ? {
                right: Math.max(8, window.innerWidth - triggerRect.right),
                bottom: window.innerHeight - triggerRect.top + 4,
              }
            : {
                right: Math.max(8, window.innerWidth - triggerRect.right),
                top: triggerRect.bottom + 4,
              },
        );
      }
    }
    setOpen((prev) => !prev);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !containerRef.current?.contains(target) &&
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

  const menu = open ? (
    <div
      ref={menuRef}
      role="menu"
      className={`${portal ? "fixed" : "absolute"} z-[1000] ${width} rounded-lg border bg-white py-1 shadow-lg ${portal ? "" : className ?? "right-0 top-full mt-1"}`}
      style={
        portal
          ? portalPosition ?? undefined
          : openUpward
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
  ) : null;

  return (
    <div
      ref={containerRef}
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

      {portal && typeof document !== "undefined"
        ? createPortal(menu, document.body)
        : menu}
    </div>
  );
}
