import { Info } from "@/app/components/common/Info";

export function CompactMetric({ label, value }: any) {
  return <Info title={label} value={value} />;
}
