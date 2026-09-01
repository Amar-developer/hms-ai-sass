import type { ReactNode } from "react";
import { CopyIdButton } from "./CopyIdButton";

type RecordIdCellProps = {
  id: string;
  label: string;
  value: ReactNode;
  allowed: boolean;
  className?: string;
  valueClassName?: string;
};

export function RecordIdCell({
  id,
  label,
  value,
  allowed,
  className = "",
  valueClassName = "",
}: RecordIdCellProps) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`} title={String(value)}>
      <b className={`block truncate ${valueClassName}`} >{value}</b>
      <CopyIdButton value={id} label={label} allowed={allowed} />
    </div>
  );
}
