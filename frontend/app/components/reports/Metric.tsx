import { Card } from "../common/ui";

function Metric({ icon: Icon, label, value, hint }: any) {
  return (
    <Card>
      <div >
        <Icon className="text-slate-500" />
        <p className="mt-3 text-xs lg:text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-xl lg:text-2xl font-bold">{value}</p>
        <p className="mt-2 text-[10px] lg:text-xs font-semibold text-slate-500">{hint}</p>
      </div>
    </Card>
  );
}

export default Metric;
