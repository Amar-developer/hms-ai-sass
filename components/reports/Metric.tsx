import { Card } from "../ui";

function Metric({ icon: Icon, label, value, hint }: any) {
  return (
    <Card>
      <Icon className="text-slate-500" />
      <p className="mt-3 text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="mt-2 text-xs font-semibold text-slate-500">{hint}</p>
    </Card>
  );
}

export default Metric