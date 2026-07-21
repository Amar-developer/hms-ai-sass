
export function ClickableRow({ children, onClick, className }: any) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event: any) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
        }
      }}
      className={`
        flex cursor-pointer gap-0 px-4 py-4 text-sm transition
        hover:bg-slate-50 focus:bg-slate-50 focus:outline-none
        items-center
        ${className ?? ""}
      `}
    >
      {children}
    </div>
  );
}
