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
    <div className="border-b-2 border-r-2 border-slate-900 px-3 py-1.5 text-[11px]">
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
      <div className="border-b-2 border-slate-900 px-4 py-1 items-center flex text-center w-full">
        <div>
          <img src="/clinic_logo.png" className="h-[50px] w-[60px]" alt="" />
        </div>
        <div className="flex flex-col items-center w-[90%]">
          {" "}
          <p className="text-lg font-extrabold uppercase">
            {STATIC_CLINIC.name}{" "}
          </p>
          <p className="text-[11px]">{STATIC_CLINIC.address}</p>
          <p className="text-[11px]">Ph: {STATIC_CLINIC.phone}</p>
          <p className="text-[11px] text-right font-semibold"> </p>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b-2 border-slate-900 text-left">
        <div className="border-r-2 border-slate-900 px-3 py-2">
          <p className="text-[11px] font-semibold  text-slate-900">
            Patient ID:{" "}
            <span className="font-semibold">{data.patientNumber || "-"}</span>
          </p>
          <p className="text-[11px] font-semibold i text-slate-900">
            Name:{" "}
            <span className="text-slate-900">
              {capitalizeFirst(data?.patientName)}
            </span>
          </p>
          <p className="text-[11px] font-semibold uppercase text-slate-900">
            {data.age ? `${data.age} Y · ` : ""}
            {data.gender || ""}
            {data.mobile ? ` · ${data.mobile}` : ""}
          </p>
        </div>
        <div className="px-3 py-2">
          <p className="text-[11px] font-bold uppercase text-slate-900">
            Token No: <span className="font-semibold">{data.tokenNumber}</span>
          </p>
          <p className="text-[11px] font-bold uppercase text-slate-900">
            Date : <span className="font-semibold">{data.appointmentDate}</span>
          </p>
          <p className="text-[11px] font-bold uppercase text-slate-900">
            Time : <span className="font-semibold">{data.appointmentTime}</span>
          </p>
        </div>
      </div>
        <div className=" border-slate-900">
          <p className="border-b-2 border-slate-900 flex justify-between px-3 py-1 text-[11px] font-bold uppercase">
            Vitals  <span className="text-[11px]">{data.visitLabel}</span>
          </p>
          <div className="grid grid-cols-2">
            <div className="border-b-2 border-r-2 border-slate-900 px-3 py-1.5 text-[11px]">
              <span className="font-semibold">BP: </span>
              <span>{data.intakeBp || "-"}</span>
            </div>
            <div className="border-b-2 border-r border-slate-900 px-3 py-1.5 text-[11px]">
              <span className="font-semibold">PR: </span>
              <span>{data.intakePulse || "-"}</span>
            </div>
            <div className="border-b-2 border-r-2 border-slate-900 px-3 py-1.5 text-[11px]">
              <span className="font-semibold">SpO2: </span>
              <span>{data.intakeSpo2 || "-"}</span>
            </div>
            <div className="border-b-2 border-r border-slate-900 px-3 py-1.5 text-[11px]">
              <span className="font-semibold">Temp: </span>
              <span>{data.intakeTemp || "-"}</span>
            </div>
            <div className="border-r-2 border-slate-900 px-3 py-1.5 text-[11px]">
              <span className="font-semibold">Height: </span>
              <span>{data.intakeHeight || "-"}</span>
            </div>
            <div className="border-r border-slate-900 px-3 py-1.5 text-[11px]">
              <span className="font-semibold">Weight: </span>
              <span>{data.intakeWeight || "-"}</span>
            </div>
          </div>
        </div>
      <div className="grid grid-cols-2 border-b border-t-2 border-slate-900">
        <div className="border-b-2 border-r-2 border-slate-900 px-3 py-1.5 text-[11px]">
          <span className="font-semibold">Dept: </span>
          <span>{data.department || "-"}</span>
        </div>
        <div className="border-b-2 border-r border-slate-900 px-3 py-1.5 text-[11px]">
          <span className="font-semibold">Doctor: </span>
          <span>{data.doctor || "-"}</span>
        </div>
        <div className=" border-r-2 border-slate-900 px-3 py-1.5 h-16 text-[11px]">
          <span className="font-semibold">INJECTION:</span>
        </div>

        <div className=" border-r border-slate-900 px-3 py-1.5 h-16 text-[11px]">
          <span className="font-semibold">LAB:</span>
        </div>
      </div>
    </div>
  );
}
