import { humanizeOptionLabel } from "@/lib/options";
import { Badge } from "@/app/components/common/ui";

export function StatusBadge({ status }: any) {
  const tone =
    status === "completed" ||
    status === "paid" ||
    status === "dispensed" ||
    status === "active"
      ? "green"
      : status === "cancelled"
        ? "red"
        : status === "pending" || status === "issued"
          ? "amber"
          : "slate";
  return (
    <Badge tone={tone} className="normal-label">
      {humanizeOptionLabel(status)}
    </Badge>
  );
}
