import { STATIC_CLINIC } from "@/features/consulation/components/PrescriptionDocument";
import { capitalizeFirst } from "@/utils/helper";

export type TokenSlipData = {
  patientName: string;
  patientNumber?: string;
  patientId?: string;
  age?: number | string | null;
  gender?: string;
  mobile?: string;
  tokenNumber: string;
  appointmentDate?: string;
  appointmentTime?: string;
  department?: string;
  doctor?: string;
  visitLabel?: string;
  billingStatus?: string;
  intakeBp?: string;
  intakePulse?: string;
  intakeSpo2?: string;
  intakeTemp?: string;
  intakeHeight?: string;
  intakeWeight?: string;
  intakeComplaints?: string;
};

function Cell({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div className="border-b border-r border-slate-900 px-3 py-1.5 text-[11px]">
      <span className="font-semibold">{label}: </span>
      <span>{value || "-"}</span>
    </div>
  );
}

export default function TokenSlip({ data }: { data: TokenSlipData }) {
  const hasVitals = Boolean(
    data.intakeBp ||
    data.intakePulse ||
    data.intakeSpo2 ||
    data.intakeTemp ||
    data.intakeHeight ||
    data.intakeWeight,
  );

  return (
    <div className="print:p-0 print:m-0 mx-auto w-[550px] print:w-[500px] border-2 border-slate-900 bg-white text-slate-900 print:max-w-full">

      <div className="border-b-2 border-slate-900 px-4 py-1 text-center">
        <p className="text-lg font-extrabold uppercase">
          {STATIC_CLINIC.name}{" "}
          <span className="text-[11px]">{data.visitLabel}</span>
        </p>
        <p className="text-[11px]">{STATIC_CLINIC.address}</p>
        <p className="text-[11px]">Ph: {STATIC_CLINIC.phone}</p>
        <p className="text-[11px] text-right font-semibold"> </p>
      </div>

      <div className="grid grid-cols-2 border-b-2 border-slate-900 text-left">
        <div className="border-r-2 border-slate-900 px-3 py-2">
          <p className="text-[11px] font-semibold  text-slate-600">
            Patient ID:{" "}
            <span className="font-semibold">{data.patientNumber || "-"}</span>
          </p>
          <p className="text-[11px] font-semibold i text-slate-600">
            Name:{" "}
            <span className="text-slate-900">
              {capitalizeFirst(data?.patientName)}
            </span>
          </p>
          <p className="text-[11px] font-semibold uppercase text-slate-600">
            {data.age ? `${data.age} Y · ` : ""}
            {data.gender || ""}
            {data.mobile ? ` · ${data.mobile}` : ""}
          </p>
        </div>
        <div className="px-3 py-2">
          <p className="text-[11px] font-bold uppercase text-slate-600">
            Token No: <span className="font-semibold">{data.tokenNumber}</span>
          </p>
          <p className="text-[11px] font-bold uppercase text-slate-600">
            Token No:{" "}
            <span className="font-semibold">{data.appointmentDate}</span>
          </p>
          <p className="text-[11px] font-bold uppercase text-slate-600">
            Token No:{" "}
            <span className="font-semibold">{data.appointmentTime}</span>
          </p>
        </div>
      </div>
      {hasVitals && (
        <div className="border-b-2 border-slate-900">
          <p className="border-b border-slate-900 px-3 py-1 text-[11px] font-bold uppercase">
            Vitals
          </p>
          <div className="grid grid-cols-2">
            <Cell label="BP" value={data.intakeBp} />
            <Cell label="PR" value={data.intakePulse} />
            <Cell label="SpO2" value={data.intakeSpo2} />
            <Cell label="Temp" value={data.intakeTemp} />
            <Cell label="Height" value={data.intakeHeight} />
            <Cell label="Weight" value={data.intakeWeight} />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 border-b-2 border-slate-900">
        <Cell label="Dept" value={data.department} />
        <Cell label="Doctor" value={data.doctor} />
        <Cell label="INJECTION" value={data.intakeBp} />
      </div>

      {data.intakeComplaints && (
        <div className="border-b-2 border-slate-900 px-3 py-2 text-[11px]">
          <p className="font-semibold">
            Complaints:{" "}
            <span className="font-normal">{data.intakeComplaints}</span>
          </p>
        </div>
      )}


    </div>
  );
}
