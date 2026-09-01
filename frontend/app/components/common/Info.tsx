import {
  Activity,
  BedDouble,
  Building2,
  CalendarDays,
  CircleCheckBig,
  Droplets,
  FileText,
  IndianRupee,
  Info as InfoIcon,
  Languages,
  Layers3,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ReceiptText,
  Repeat2,
  UserRound,
  type LucideIcon,
} from "lucide-react";

const iconRules: Array<{
  pattern: RegExp;
  icon: LucideIcon;
  tone: string;
}> = [
  {
    pattern: /whatsapp|message|communication/,
    icon: MessageCircle,
    tone: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  },
  {
    pattern: /blood/,
    icon: Droplets,
    tone: "bg-rose-50 text-rose-600 ring-rose-100",
  },
  {
    pattern: /mobile|phone|contact/,
    icon: Phone,
    tone: "bg-sky-50 text-sky-600 ring-sky-100",
  },
  {
    pattern: /address|location/,
    icon: MapPin,
    tone: "bg-amber-50 text-amber-600 ring-amber-100",
  },
  {
    pattern: /start|end|date|created|expiry|time|activity/,
    icon: CalendarDays,
    tone: "bg-blue-50 text-blue-600 ring-blue-100",
  },
  {
    pattern: /invoice/,
    icon: ReceiptText,
    tone: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  },
  {
    pattern: /bill|amount|total|price|cost|revenue|paid|due|credit|discount|charge|payable/,
    icon: IndianRupee,
    tone: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  },
  {
    pattern: /patient|member|user|age|gender|family/,
    icon: UserRound,
    tone: "bg-violet-50 text-violet-600 ring-violet-100",
  },
  {
    pattern: /recurrence|frequency|cycle/,
    icon: Repeat2,
    tone: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  },
  {
    pattern: /branch|tenant|clinic|workspace/,
    icon: Building2,
    tone: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  },
  {
    pattern: /plan|subscription|tier|access|limit/,
    icon: Layers3,
    tone: "bg-violet-50 text-violet-600 ring-violet-100",
  },
  {
    pattern: /admission|room|bed/,
    icon: BedDouble,
    tone: "bg-sky-50 text-sky-600 ring-sky-100",
  },
  {
    pattern: /treatment|complaint|diagnosis|pain|bp|pulse|spo2|temp|height|weight|vital/,
    icon: Activity,
    tone: "bg-rose-50 text-rose-600 ring-rose-100",
  },
  {
    pattern: /language/,
    icon: Languages,
    tone: "bg-blue-50 text-blue-600 ring-blue-100",
  },
  {
    pattern: /email/,
    icon: Mail,
    tone: "bg-sky-50 text-sky-600 ring-sky-100",
  },
  {
    pattern: /status|type|active|completed/,
    icon: CircleCheckBig,
    tone: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  },
  {
    pattern: /document|file|reference|source|notes/,
    icon: FileText,
    tone: "bg-slate-100 text-slate-600 ring-slate-200",
  },
];

function iconPresentation(heading: string) {
  return (
    iconRules.find(({ pattern }) => pattern.test(heading.toLowerCase())) || {
      icon: InfoIcon,
      tone: "bg-slate-100 text-slate-600 ring-slate-200",
    }
  );
}

export function Info({ title, label, value, icon, tone }: any) {
  const heading = title ?? label;
  const presentation = iconPresentation(String(heading || ""));
  const Icon = icon || presentation.icon;
  const iconTone = tone || presentation.tone;

  return (
    <div className="flex min-h-[82px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition-colors hover:border-slate-300 hover:shadow-md">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ring-1 ${iconTone}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
          {heading}
        </p>
        <p className="mt-1 break-words text-sm font-black leading-snug text-slate-950">
          {value}
        </p>
      </div>
    </div>
  );
}
