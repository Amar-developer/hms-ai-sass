import { useEffect, useRef, useState } from "react";

interface Options {
  /** How long `pending` must stay true before the skeleton appears. Avoids a flash for routes that resolve almost instantly. */
  debounceMs?: number;
  /** Once shown, the skeleton stays up at least this long so it doesn't flicker in and out. */
  minDurationMs?: number;
}

/**
 * Turns a raw "navigation is pending" boolean into a debounced,
 * minimum-duration skeleton signal: `pending` flips true the instant a
 * route/module switch is requested, but real UIs resolve inconsistently
 * fast, so showing/hiding the skeleton on that raw signal causes flicker.
 */
export function useNavigationSkeleton(
  pending: boolean,
  { debounceMs = 120, minDurationMs = 350 }: Options = {},
) {
  const [showSkeleton, setShowSkeleton] = useState(false);
  const shownAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (pending) {
      timerRef.current = setTimeout(() => {
        shownAtRef.current = Date.now();
        setShowSkeleton(true);
      }, debounceMs);
    } else if (showSkeleton) {
      const elapsed = Date.now() - (shownAtRef.current ?? Date.now());
      const remaining = Math.max(minDurationMs - elapsed, 0);
      timerRef.current = setTimeout(() => {
        shownAtRef.current = null;
        setShowSkeleton(false);
      }, remaining);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return showSkeleton;
}
