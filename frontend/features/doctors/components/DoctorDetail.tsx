import React from "react";
import { Badge, Card } from "@/app/components/common/ui";
import { doctorTypes } from "@/features/doctors/constants";
import {
  activeDoctorDepartmentFeeRules,
  activeDoctorFeeRule,
  formatPractitionerName,
} from "@/features/doctors/helpers";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-700">{value || "-"}</p>
    </div>
  );
}

export function  DoctorDetail({
  doctor,
  branches,
  departments,
  feeRules,
  canEditDoctor,
  onEdit,
  back,
}: any) {
  const branchNames = (doctor.branch_ids || [])
    .map((id: string) => branches.find((b: any) => b.id === id)?.name || id)
    .join(", ");
  const departmentFeeRules = activeDoctorDepartmentFeeRules(feeRules, doctor);
  const fallbackFeeRule = activeDoctorFeeRule(feeRules, doctor);
  const specialties = (doctor.department_ids || []).map((id: string) => {
    const rule =
      departmentFeeRules.find((r: any) => r.department_id === id) ||
      fallbackFeeRule;
    return {
      name: departments.find((d: any) => d.id === id)?.name || id,
      fee: rule ? `₹${Number(rule.fee_amount || 0).toLocaleString("en-IN")}` : "-",
      share: rule?.doctor_share_percentage,
    };
  });

  return (
    <Card className="p-3 bg-white">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="card-title font-bold">Doctor Details</h3>
        </div>
        <div className="flex gap-2">
          {canEditDoctor && (
            <button
              type="button"
              onClick={onEdit}
              className="primary-action px-4 py-2 text-xs"
            >
              Edit
            </button>
          )}
          <button type="button" onClick={back} className="close-button font-bold">
            Back to Doctors
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Full Name" value={formatPractitionerName(doctor)} />
        <Field
          label="Doctor Type"
          value={
            doctorTypes.find(([value]) => value === doctor.practitioner_type)?.[1] ||
            doctor.practitioner_type
          }
        />
        <Field label="Registration Number" value={doctor.registration_number} />
        <Field label="Mobile" value={doctor.mobile} />
        <Field label="Email" value={doctor.email} />
        <Field
          label="Status"
          value={
            <Badge tone={doctor.status === "active" ? "green" : "red"} className="normal-badge w-[50%]">
              {doctor.status === "active" ? "Active" : "Inactive"}
            </Badge>
          }
        />
        <Field label="Branches" value={branchNames} />
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 p-4">
        <h4 className="table-data font-bold text-slate-900">
          Specialties & Consultation Prices
        </h4>
        <div className="mt-3 grid gap-2">
          {specialties.length ? (
            specialties.map((specialty: any, index: number) => (
              <div
                key={index}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
              >
                <span className="text-sm font-semibold text-slate-700">
                  {specialty.name}
                </span>
                <span className="text-sm text-slate-500">
                  {specialty.fee}
                  {specialty.share != null ? ` · Doctor Share ${specialty.share}%` : ""}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No specialties mapped.</p>
          )}
        </div>
      </div>
    </Card>
  );
}
