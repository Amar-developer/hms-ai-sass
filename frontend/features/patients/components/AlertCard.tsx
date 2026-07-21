import { humanizeOptionLabel } from "@/lib/options";
import { Badge } from "@/app/components/common/ui";

export function AlertCard({ alert }: any) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-sm">
      <b>{alert.title}</b>
      <p className="text-slate-600">{alert.description || alert.alert_type}</p>
      <Badge tone={alert.severity === "critical" ? "red" : "amber"}>
        {humanizeOptionLabel(alert.severity)}
      </Badge>
    </div>
  );
}
