import { useEffect, useRef, useState, type RefObject } from "react";

export function useDropdown(additionalRef?: RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const isInsideTrigger = ref.current?.contains(target);
      const isInsideAdditional = additionalRef?.current?.contains(target);
      if (open && !isInsideTrigger && !isInsideAdditional) {
        setOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (open && e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [additionalRef, open]);

  return { open, setOpen, ref, buttonRef };
}
