interface SkeletonProps {
  className?: string;
  /** Fixed height, e.g. "1rem" or 16 (px). Omit to size via className instead. */
  height?: number | string;
  /** Fixed width, e.g. "100%" or 200. Omit to size via className instead. */
  width?: number | string;
  /** "pulse" (default) fades in/out; "shimmer" sweeps a highlight across; "none" is static (useful under prefers-reduced-motion). */
  animation?: "pulse" | "shimmer" | "none";
}

export function Skeleton({
  className = "",
  height,
  width,
  animation = "pulse",
}: SkeletonProps) {
  const animationClass =
    animation === "pulse"
      ? "animate-pulse"
      : animation === "shimmer"
        ? "skeleton-shimmer"
        : "";

  return (
    <div
      aria-hidden="true"
      className={`rounded-md bg-slate-200 ${animationClass} ${className}`}
      style={{
        height: typeof height === "number" ? `${height}px` : height,
        width: typeof width === "number" ? `${width}px` : width,
      }}
    />
  );
}
