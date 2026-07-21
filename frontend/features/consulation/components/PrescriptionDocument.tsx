import { uploadAssetUrl } from "@/lib/api";

export type PrescriptionClinic = {
  name?: string;
  legal_name?: string;
  address?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
};

// Fixed letterhead content for this clinic's printed prescriptions — set once
export const STATIC_CLINIC: PrescriptionClinic = {
  name: "SRI MAHA CLINIC",
  legal_name: "MedizinHub Healthcare Service Pvt.Ltd",
  address: "No.112 A,Radha Nagar Main Road, Chromepet, Chennai - 600 044",
  phone: "90476 60909",
  email: "srimahaclinic@gmail.com",
};

export type PrescriptionDoctor = {
  name?: string;
  qualification?: string;
  registrationNumber?: string;
  specialty?: string;
  signatureUrl?: string;
};

export type PrescriptionMedicine = {
  name?: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
};

export type PrescriptionReferral = {
  label: string;
  value: string;
};

export type PrescriptionDocumentProps = {
  clinic?: PrescriptionClinic;
  doctor: PrescriptionDoctor;
  patientName: string;
  patientId?: string;
  vitals: string;
  notes?: string;
  medicines: PrescriptionMedicine[];
  referrals?: PrescriptionReferral[];
};

function parseVitals(vitals: string) {
  const byName: Record<string, string> = {};
  String(vitals || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const [name, rest = ""] = item.split("=");
      if (!name?.trim()) return;
      byName[name.trim().toLowerCase()] = rest.trim();
    });
  return byName;
}

function vitalValue(byName: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = byName[key.toLowerCase()];
    if (value) return value;
  }
  return "";
}

function doctorDisplayName(value: string) {
  const trimmed = value.trim();
  return /^dr\.?\s/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
}

function formatPrintDate(date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

// The clinic wordmark renders as two stacked lines — every word but the
// last in brand blue, the last word (e.g. "CLINIC") in brand green.
function splitClinicName(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { primary: name, accent: "" };
  return {
    primary: words.slice(0, -1).join(" "),
    accent: words[words.length - 1],
  };
}

// Back pages hold the medicine and lab-test tables together, so the row
// budget per page is split across both tables' headers + rows.
const MAX_ROWS_PER_BACK_PAGE = 14;

type BackPage = {
  medicineRows: PrescriptionMedicine[];
  medicineStartIndex: number;
  medicineContinued: boolean;
  referralRows: PrescriptionReferral[];
  referralStartIndex: number;
  referralContinued: boolean;
};

function paginateBackPages(
  medicines: PrescriptionMedicine[],
  referrals: PrescriptionReferral[],
  maxRowsPerPage: number,
): BackPage[] {
  const pages: BackPage[] = [];
  let medIndex = 0;
  let refIndex = 0;
  while (medIndex < medicines.length || refIndex < referrals.length) {
    let remaining = maxRowsPerPage;
    const medicineStartIndex = medIndex;
    while (medIndex < medicines.length && remaining > 0) {
      medIndex += 1;
      remaining -= 1;
    }
    const referralStartIndex = refIndex;
    while (refIndex < referrals.length && remaining > 0) {
      refIndex += 1;
      remaining -= 1;
    }
    pages.push({
      medicineRows: medicines.slice(medicineStartIndex, medIndex),
      medicineStartIndex,
      medicineContinued:
        medicineStartIndex > 0 && medIndex > medicineStartIndex,
      referralRows: referrals.slice(referralStartIndex, refIndex),
      referralStartIndex,
      referralContinued:
        referralStartIndex > 0 && refIndex > referralStartIndex,
    });
  }
  return pages;
}

function PhoneIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 10 12"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M6.96203 11.128C6.51509 11.0578 5.91235 10.7994 5.05376 10.1324C4.01006 9.31899 3.21769 8.5949 2.25671 7.29502C1.33051 6.03958 0.907149 5.25443 0.371435 3.79376C-0.233901 2.14446 0.0347404 1.37194 0.248836 1.05736C0.504029 0.681261 0.82472 0.482705 1.22778 0.29894C1.45632 0.197132 1.69392 0.116407 1.93758 0.0577897C1.96201 0.0516501 1.98476 0.0457116 2.00508 0.0403191C2.12635 0.00762988 2.31005 -0.0417003 2.51477 0.0739578C2.65148 0.150634 2.76376 0.281239 2.93552 0.511189C3.28785 0.982217 3.7145 1.97503 3.85456 2.4517C3.94841 2.77288 4.01061 2.98493 3.97607 3.20638C3.93536 3.4656 3.77209 3.6448 3.57816 3.83542C3.5418 3.87124 3.50596 3.90528 3.47121 3.93833C3.26141 4.13736 3.2129 4.19679 3.21974 4.31756C3.23394 4.56035 3.50497 5.31903 4.0338 6.03467C4.56262 6.75031 5.19368 7.21082 5.42415 7.29851C5.54324 7.34389 5.61697 7.3151 5.88128 7.1738C5.91919 7.15354 5.95815 7.13252 5.99871 7.11175C6.27098 6.97054 6.48372 6.87381 6.7397 6.914L6.74108 6.91422C6.96386 6.9492 7.13959 7.07469 7.43083 7.28188C7.81069 7.55216 8.66485 8.25486 9.01301 8.7315C9.18239 8.96316 9.2743 9.10843 9.30652 9.26033C9.35507 9.48903 9.2509 9.64596 9.18252 9.75121C9.1711 9.76867 9.15848 9.7878 9.14504 9.80912C9.0132 10.0198 8.862 10.218 8.69335 10.4012C8.39343 10.7229 8.10307 10.9629 7.66163 11.0878C7.43471 11.1534 7.19549 11.1672 6.96203 11.128Z"
        fill="#00A868"
      />
    </svg>
  );
}

function PrescriptionPage({
  clinic,
  doctor,
  patientName,
  patientId,
  printDate,
  vitalRows,
  notes,
  medicineRows,
  medicineStartIndex,
  medicineContinued,
  referralRows,
  referralStartIndex,
  referralContinued,
  isFirstPage,
  pageNumber,
  totalPages,
}: {
  clinic: PrescriptionClinic;
  doctor: PrescriptionDoctor;
  patientName: string;
  patientId: string;
  printDate: string;
  vitalRows: Array<[string, string]>;
  notes: string;
  medicineRows: PrescriptionMedicine[];
  medicineStartIndex: number;
  medicineContinued: boolean;
  referralRows: PrescriptionReferral[];
  referralStartIndex: number;
  referralContinued: boolean;
  isFirstPage: boolean;
  pageNumber: number;
  totalPages: number;
}) {
  const clinicName = clinic.name || "Clinic";
  const { primary: clinicNamePrimary, accent: clinicNameAccent } =
    splitClinicName(clinicName);
  const subtitle =
    clinic.legal_name && clinic.legal_name !== clinic.name
      ? clinic.legal_name
      : "";

  return (
    <section className="relative w-[794px] h-[1122px] mx-auto bg-white overflow-hidden break-after-page last:break-after-auto">
      {isFirstPage && (
        <>
          {/* Everything above the signature/footer strip flows naturally
              top-to-bottom so variable-length clinic address / doctor name /
              specialty never collides with fixed positions below it. */}
          <div className="max-h-[888px] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-[49px] pt-[27px] pb-[11px] border-b-[1px] border-[#0175A7]/70 bg-white">
              <div className="flex items-center gap-12">
                <img
                  className="block w-[98px] h-[98px] shrink-0"
                  src={uploadAssetUrl(clinic.logo_url) || "/clinic_logo.png"}
                  alt=""
                />
                <div className="flex-1 min-w-0 pt-[5px]">
                  <h1 className="m-0 leading-none whitespace-nowrap ">
                    <span className="text-5xl font-extrabold font-['Poppins'] tracking-[0.917px] text-[#0175A7]">
                      {clinicNamePrimary}
                    </span>
                    {clinicNameAccent && (
                      <span className="text-5xl font-extrabold font-['Poppins'] tracking-[0.917px] text-[#00B36F] ml-[10px]">
                        {clinicNameAccent}
                      </span>
                    )}
                  </h1>
                  <div className="mt-[6px] w-[460px] max-w-full h-0 border-t-[1px] border-[#0175A7]/70" />
                  {subtitle && (
                    <p className="mt-[6px] flex flex-wrap items-center gap-[8px]">
                      <span className="text-[9px] font-bold font-['Poppins'] tracking-[0.124px] text-[#00B36F] whitespace-nowrap">
                        A Unit of
                      </span>
                      <span className="text-base font-bold font-['Poppins'] capitalize tracking-[0.124px] text-[#0175A7]">
                        {subtitle}
                      </span>
                    </p>
                  )}
                  {clinic.address && (
                    <p className="mt-[6px] text-[#0175A7] text-[11px] font-normal font-['Poppins'] leading-[12.5px] tracking-[1px]">
                      {clinic.address}
                    </p>
                  )}
                  {(clinic.phone || clinic.email) && (
                    <p className="mt-[6px] flex flex-wrap items-center gap-[20px]">
                      {clinic.phone && (
                        <span className="inline-flex items-center gap-[4px] whitespace-nowrap">
                          <strong className="text-[#00B36F] text-[12px] font-bold font-['Poppins'] tracking-[0.5px]">
                            For Appointment :
                          </strong>
                          <span className="text-[#0175A7] text-[12px] font-bold font-['Poppins'] tracking-[0.5px]">
                            {clinic.phone}
                          </span>
                        </span>
                      )}
                      {clinic.email && (
                        <span className="inline-flex items-center gap-[4px] whitespace-nowrap">
                          <img
                            src="/email.svg"
                            alt=""
                            className="w-[11px] h-auto"
                          />
                          <span className="text-[#0175A7] text-[10px] font-medium font-['Poppins'] tracking-[1px]">
                            {clinic.email}
                          </span>
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Doctor info + Patient name / Date + vitals */}
            <div className="px-[49px] pt-[26px] grid grid-cols-[1fr_129px] gap-[30px] items-start">
              <div className="min-w-0">
                <p className="m-0 text-[#0175A7] text-[21px] font-bold font-['Poppins'] leading-none tracking-[0.6px]">
                  {doctorDisplayName(doctor.name || "-")}{" "}
                  {doctor.qualification && (
                    <span className="text-[#00B36F] text-[14px] font-semibold font-['Poppins'] ml-[4px]">
                      {doctor.qualification}
                    </span>
                  )}
                </p>
                <p className="m-0 mt-[9px] flex flex-wrap items-center gap-[10px] text-[#00B36F] text-[12px] font-semibold font-['Poppins'] leading-none tracking-[0.8px]">
                  {doctor.registrationNumber && (
                    <span>Reg.No: {doctor.registrationNumber} moses</span>
                  )}
                  {doctor.registrationNumber && doctor.specialty && (
                    <span className="inline-block h-[14px] w-0 border-l-[1px] border-[#0175A7]" />
                  )}
                  {doctor.specialty && <span>{doctor.specialty}</span>}
                </p>
                <p className="m-0 mt-[53px] text-[#0175A7]">
                  <span className="text-[16px] font-medium font-['Poppins'] tracking-[0.8px]">
                    Patient Name:{" "}
                  </span>
                  <span className="inline-block min-w-[200px] text-[16px] font-normal font-['Poppins'] tracking-[0.8px]">
                    {patientName}
                  </span>
                </p>
                <p className="m-0 mt-[8px] text-[#0175A7]">
                  <span className="text-[16px] font-medium font-['Poppins'] tracking-[0.8px]">
                    Patient ID:{" "}
                  </span>
                  <span className="inline-block min-w-[200px] text-[16px] font-normal font-['Poppins'] tracking-[0.8px]">
                    {patientId}
                  </span>
                </p>
              </div>
              <div className="flex flex-col gap-[24px]">
                <div className="flex items-end gap-[4px] text-[#0175A7] whitespace-nowrap">
                  <span className="text-[16px] font-bold font-['Poppins']">
                    Date:
                  </span>
                  <span className="min-w-[110px] text-[16px] font-bold font-['Poppins']">
                    {printDate}
                  </span>
                </div>
                <div className="flex flex-col gap-[14px] pl-[24px]">
                  {vitalRows.map(([label, value]) => (
                    <div key={label} className="flex items-center gap-[16px]">
                      <span className="shrink-0 text-[#0175A7] text-[16px] font-bold font-['Poppins']">
                        {label}
                      </span>
                      <span className="w-[100px] min-h-[16px] border-b-[1px] border-[#7fb3cc] text-right text-[#0175A7] text-[12px] font-bold font-['Poppins']">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Doctor Notes */}
            <div className="relative flex-1 min-h-[265px] px-[49px] pt-[26px]">
              <p className="m-0 text-[#111827] text-[16px] font-semibold font-['Poppins'] underline underline-offset-[2px]">
                Doctor Notes:
              </p>
              <img
                src="/clinic_logo.png"
                alt=""
                aria-hidden="true"
                className="pointer-events-none select-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[256px] h-auto opacity-10"
              />
              <div className="relative mt-[11px] whitespace-pre-wrap text-[#111827] text-[14px] leading-[1.5] font-['Poppins'] tracking-[0.6px]">
                {notes}
              </div>
            </div>
          </div>

          {/* Page number + signature */}
          <span className="absolute left-[33px] bottom-[204px] text-[#0175A7] text-[14px] font-semibold font-['Poppins'] tracking-[0.6px]">
            Page Number: {pageNumber} of {totalPages}
          </span>
          <div className="absolute right-[49px] bottom-[196px] w-[192px] flex flex-col items-center gap-[4px]">
            {doctor.signatureUrl && (
              <img
                src={uploadAssetUrl(doctor.signatureUrl)}
                alt="Doctor signature"
                className="h-[53px] w-[151px] object-contain"
              />
            )}
            <div className="w-[192px] h-0" />
            <span className="text-[#0175A7] text-[14px] font-semibold font-['Poppins']">
              Doctor Signature
            </span>
          </div>

          {/* Footer */}

          <div className="absolute left-0 right-0 bottom-0 border-t-[1px] border-[#0175A7]/70 px-[49px] pt-[11px] pb-[11px] grid grid-cols-[1fr_283px] gap-[30px] items-start bg-white">
            <div className="flex items-start gap-[20px]">
              <img
                className="block w-[76px] h-auto shrink-0"
                src="/footer_logo.svg"
                alt=""
              />
              <div className="min-w-0 flex-1">
                <img
                  className="block w-[240px] h-auto"
                  src="/pharmacy_logo.svg"
                  alt="Pharmacy"
                />
                <p className="m-0 mt-[4px] text-[#0175A7] text-[12px] font-medium font-['Poppins'] leading-[16px] ">
                  Radha Nagar Main Road, Chromepet.
                </p>
                {(clinic.phone || clinic.email) && (
                  <p className="m-0 mt-1 flex flex-wrap items-center gap-[11px] text-[#0175A7]">
                    {clinic.phone && (
                      <span className="inline-flex items-center gap-[4px] whitespace-nowrap">
                        <PhoneIcon className="w-[10px] h-auto" />
                        <span className="text-[12px] font-semibold font-['Poppins']">
                          {clinic.phone}
                        </span>
                      </span>
                    )}
                    {clinic.email && (
                      <span className="inline-flex items-center gap-[4px] whitespace-nowrap">
                        <img
                          src="/email.svg"
                          alt=""
                          className="w-[12px] h-auto"
                        />
                        <span className="text-[12px] font-semibold font-['Poppins']">
                          {clinic.email}
                        </span>
                      </span>
                    )}
                  </p>
                )}
                <img
                  className="block mt-1 w-[207px] h-auto"
                  src="/home_delivery.svg"
                  alt="Free home delivery"
                />
              </div>
            </div>
            <div className="border-l-[3px] border-[#0175A7] pl-[11px]">
              <p className="m-0 text-[#0175A7] text-xs font-bold font-['Poppins']">
                CLINICAL LABORATORY SERVICES
              </p>
              <div className="mt-[6px] flex flex-col gap-[7px]">
                <p className="m-0 flex items-center gap-[6px] text-[#0175A7] text-[10px] font-['Poppins']">
                  <span className="inline-block w-[8px] h-[8px] shrink-0 rounded-full bg-[#0175A7]" />
                  All types of test are done here at Reasonable Price
                </p>
                <p className="m-0 flex items-center gap-[6px] text-[#00B36F] text-[10px] font-['Poppins']">
                  <span className="inline-block w-[8px] h-[8px] shrink-0 rounded-full bg-[#00B36F]" />
                  Home sample collection available
                </p>
                <p className="m-0 flex items-center gap-[6px] text-[#0175A7] text-[10px] font-['Poppins']">
                  <span className="inline-block w-[8px] h-[8px] shrink-0 rounded-full bg-[#0175A7]" />
                  Online-Consultation on blood reports
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {!isFirstPage && (
        <div className="absolute right-0 left-0 top-0 h-[1122px] flex flex-col  px-[20px] pb-[11px] pt-[53px] overflow-hidden">
          <section className="pt-[8px] px-[30px] pb-0 text-[#111827]">
            {medicineRows.length > 0 && (
              <>
                <p className="m-0 mb-[11px] text-[#111827] text-[16px] font-semibold font-['Poppins'] underline underline-offset-[2px]">
                  Prescribed Medicines{medicineContinued ? " (Continued)" : ""}:
                </p>
                <table className="w-full table-fixed border-collapse overflow-hidden rounded-[3px] border border-[#d5d5d5] text-[#111827] text-[12px] font-['Poppins']">
                  <thead>
                    <tr className="bg-[#E3FFE6]">
                      <th className="px-[9px] py-[10px] text-left text-[13px] font-semibold whitespace-nowrap w-[8%]">
                        S.No
                      </th>
                      <th className="px-[9px] py-[10px] text-left text-[13px] font-semibold whitespace-nowrap w-[30%]">
                        Medicine
                      </th>
                      <th className="px-[9px] py-[10px] text-left text-[13px] font-semibold whitespace-nowrap w-[13%]">
                        Dosage
                      </th>
                      <th className="px-[9px] py-[10px] text-left text-[13px] font-semibold whitespace-nowrap w-[13%]">
                        Duration
                      </th>
                      <th className="px-[9px] py-[10px] text-left text-[13px] font-semibold whitespace-nowrap w-[14%]">
                        Frequency
                      </th>
                      <th className="px-[9px] py-[10px] text-left text-[13px] font-semibold whitespace-nowrap w-[22%]">
                        Instruction
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {medicineRows.map((med, index) => (
                      <tr
                        key={index}
                        className={`break-inside-avoid ${index % 2 === 1 ? "bg-[#f7f7f7]" : "bg-white"}`}
                      >
                        <td className="px-[9px] py-[9px] align-top leading-[1.2] font-medium">
                          {medicineStartIndex + index + 1}
                        </td>
                        <td className="px-[9px] py-[9px] align-top leading-[1.2] font-medium">
                          {med.name || "Medicine"}
                        </td>
                        <td className="px-[9px] py-[9px] align-top leading-[1.2] font-medium">
                          {med.dosage}
                        </td>
                        <td className="px-[9px] py-[9px] align-top leading-[1.2] font-medium">
                          {med.duration}
                        </td>
                        <td className="px-[9px] py-[9px] align-top leading-[1.2] font-medium">
                          {med.frequency}
                        </td>
                        <td className="px-[9px] py-[9px] align-top leading-[1.2] font-medium">
                          {med.instructions}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {referralRows.length > 0 && (
              <div className={medicineRows.length > 0 ? "mt-[19px]" : ""}>
                <p className="m-0 mb-[11px] text-[#111827] text-[16px] font-semibold font-['Poppins'] underline underline-offset-[2px]">
                  Prescribed Lab Tests{referralContinued ? " (Continued)" : ""}:
                </p>
                <table className="w-full table-fixed border-collapse overflow-hidden rounded-[3px] border border-[#d5d5d5] text-[#111827] text-[12px] font-['Poppins']">
                  <thead>
                    <tr className="bg-[#e3ffe5]">
                      <th className="px-[9px] py-[10px] text-left text-[13px] font-semibold whitespace-nowrap w-[8%]">
                        S.No
                      </th>
                      <th className="px-[9px] py-[10px] text-left text-[13px] font-semibold whitespace-nowrap w-[38%]">
                        Investigations / Referrals
                      </th>
                      <th className="px-[9px] py-[10px] text-left text-[13px] font-semibold whitespace-nowrap w-[54%]">
                        Lab Test / Service Name
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {referralRows.map((row, index) => (
                      <tr
                        key={index}
                        className={`break-inside-avoid ${index % 2 === 1 ? "bg-[#f7f7f7]" : "bg-white"}`}
                      >
                        <td className="px-[9px] py-[9px] align-top leading-[1.2] font-medium">
                          {referralStartIndex + index + 1}
                        </td>
                        <td className="px-[9px] py-[9px] align-top leading-[1.2] font-medium">
                          {row.label}
                        </td>
                        <td className="px-[9px] py-[9px] align-top leading-[1.2] font-medium">
                          {row.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <img
            src="/clinic_logo.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none select-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[256px] h-auto opacity-10"
          />

          <div className="mt-auto flex items-end justify-between px-[30px] pt-[15px]">
            <span className="text-[16px] font-semibold font-['Poppins'] text-[#0175A7]">
              Page Number: {pageNumber} of {totalPages}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

export default function PrescriptionDocument({
  clinic = STATIC_CLINIC,
  doctor,
  patientName,
  patientId = "",
  vitals,
  notes = "",
  medicines,
  referrals = [],
}: PrescriptionDocumentProps) {
  const byName = parseVitals(vitals);
  const vitalRows: Array<[string, string]> = [
    ["Bp", vitalValue(byName, "bp", "blood pressure")],
    ["PR", vitalValue(byName, "pr", "pulse")],
    ["Spo2", vitalValue(byName, "spo2", "spo₂")],
    ["Temp", vitalValue(byName, "temp", "temperature")],
    ["Weight", vitalValue(byName, "weight")],
  ];
  const printDate = formatPrintDate();

  // Page 1 always carries the doctor/vitals header and clinical notes.
  // Every subsequent page (the "backside") holds the medicine + lab test
  // tables, split across pages if they overflow one page's row budget.
  const backPages = paginateBackPages(
    medicines,
    referrals,
    MAX_ROWS_PER_BACK_PAGE,
  );
  const totalPages = 1 + backPages.length;

  return (
    <div>
      <PrescriptionPage
        clinic={clinic}
        doctor={doctor}
        patientName={patientName}
        patientId={patientId}
        printDate={printDate}
        vitalRows={vitalRows}
        notes={notes}
        medicineRows={[]}
        medicineStartIndex={0}
        medicineContinued={false}
        referralRows={[]}
        referralStartIndex={0}
        referralContinued={false}
        isFirstPage
        pageNumber={1}
        totalPages={totalPages}
      />
      {backPages.map((page, index) => (
        <PrescriptionPage
          key={index}
          clinic={clinic}
          doctor={doctor}
          patientName={patientName}
          patientId={patientId}
          printDate={printDate}
          vitalRows={[]}
          notes=""
          medicineRows={page.medicineRows}
          medicineStartIndex={page.medicineStartIndex}
          medicineContinued={page.medicineContinued}
          referralRows={page.referralRows}
          referralStartIndex={page.referralStartIndex}
          referralContinued={page.referralContinued}
          isFirstPage={false}
          pageNumber={index + 2}
          totalPages={totalPages}
        />
      ))}
    </div>
  );
}
