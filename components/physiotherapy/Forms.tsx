import { CaseFields,SearchSelect } from "./Shared";
import { Card,Button } from "../common/ui";
import { useState } from "react";
import { appointmentLabel, appointmentPatientId, formatPhysiotherapistName, patientLabel, patientName } from "@/utils/physiotherapy/helpers";
import { FormField} from "../FormElements";

export function CaseForm({
  title,
  subtitle,
  patients,
  appointments,
  physiotherapists,
  onSubmit,
  busy,
  onCancel,
}: any) {
  const [patientId, setPatientId] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [physiotherapistId, setPhysiotherapistId] = useState("");
  const patientOptions = patients.map((p: any) => ({
    value: p.id,
    label: patientLabel(p),
    item: p,
  }));
  const appointmentOptions = [
    { value: "", label: "No linked appointment", item: null },
    ...appointments.map((a: any) => ({
      value: a.id,
      label: appointmentLabel(a),
      item: a,
    })),
  ];
  const physiotherapistOptions = physiotherapists.map((row: any) => ({
    value: row.id,
    label: formatPhysiotherapistName(row),
    item: row,
  }));

  return (
    <Card>
      <div>
        <h4 className="text-xl font-bold">{title}</h4>
        <p className="table-data text-slate-500">{subtitle}</p>
      </div>
      <form onSubmit={onSubmit} className="mt-5 grid gap-4">
        <FormField label="Patient">
          <SearchSelect
            name="patient_id"
            value={patientId}
            onChange={setPatientId}
            options={patientOptions}
            placeholder="Type patient name, mobile, or number"
            required
            getSearchText={(p: any) =>
              [
                patientName(p),
                p?.mobile,
                p?.patientNumber,
                p?.patient_number,
                p?.id,
              ]
                .filter(Boolean)
                .join(" ")
            }
          />
        </FormField>
        <FormField label="Linked OP Appointment">
          <SearchSelect
            name="source_appointment_id"
            value={appointmentId}
            onChange={(nextAppointmentId: string, appointment: any) => {
              setAppointmentId(nextAppointmentId);
              const nextPatientId = appointmentPatientId(appointment);
              if (nextPatientId) setPatientId(nextPatientId);
            }}
            options={appointmentOptions}
            placeholder="Type patient, date, or doctor"
            getSearchText={(a: any) =>
              a
                ? [
                    a.patient,
                    a.appointmentDate,
                    a.appointment_date,
                    a.date,
                    a.doctor,
                    appointmentPatientId(a),
                    a.id,
                  ]
                    .filter(Boolean)
                    .join(" ")
                : "No linked appointment"
            }
          />
        </FormField>
        <FormField label="Physiotherapist">
          <SearchSelect
            name="physiotherapist_id"
            value={physiotherapistId}
            onChange={setPhysiotherapistId}
            options={physiotherapistOptions}
            placeholder="Type physiotherapist name"
            required
            getSearchText={(row: any) =>
              [
                formatPhysiotherapistName(row),
                row?.primary_specialty,
                row?.registration_number,
                row?.id,
              ]
                .filter(Boolean)
                .join(" ")
            }
          />
        </FormField>
        <CaseFields />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="close-button font-bold"
          >
            Cancel
          </button>
          <Button disabled={busy}>Create OP Physio Case</Button>
        </div>
      </form>
    </Card>
  );
}

export function IPCaseForm({
  admissions,
  patientMap,
  physiotherapists,
  onSubmit,
  busy,
  onCancel,
}: any) {
  const [admissionId, setAdmissionId] = useState("");
  const [physiotherapistId, setPhysiotherapistId] = useState("");
  const admissionOptions = admissions.map((row: any) => {
    const patient = patientMap.get(row.patient_id || row.patientId);
    return {
      value: row.id,
      label: `${patientName(patient)} · ${row.admission_number || row.id} · Bed ${row.bed || "-"}`,
      item: row,
    };
  });
  const physiotherapistOptions = physiotherapists.map((row: any) => ({
    value: row.id,
    label: formatPhysiotherapistName(row),
    item: row,
  }));

  return (
    <Card>
      <div>
        <h4 className="text-xl lg:text-xl font-bold">IP Bedside Physiotherapy Case</h4>
        <p className="table-data text-slate-500">
          Use this for post-surgical rehab, bedridden patients, acute injury
          management, CPM, gait training, tilt table, and EMS workflows.
        </p>
      </div>
      <form onSubmit={onSubmit} className="mt-5 grid gap-4">
        <FormField label="IP Admission">
          <SearchSelect
            name="ip_admission_id"
            value={admissionId}
            onChange={setAdmissionId}
            options={admissionOptions}
            placeholder="Type patient, admission, or bed"
            required
            getSearchText={(row: any) => {
              const patient = patientMap.get(row?.patient_id || row?.patientId);
              return [
                patientName(patient),
                row?.admission_number,
                row?.bed,
                row?.id,
              ]
                .filter(Boolean)
                .join(" ");
            }}
          />
        </FormField>
        <FormField label="Physiotherapist">
          <SearchSelect
            name="physiotherapist_id"
            value={physiotherapistId}
            onChange={setPhysiotherapistId}
            options={physiotherapistOptions}
            placeholder="Type physiotherapist name"
            required
            getSearchText={(row: any) =>
              [
                formatPhysiotherapistName(row),
                row?.primary_specialty,
                row?.registration_number,
                row?.id,
              ]
                .filter(Boolean)
                .join(" ")
            }
          />
        </FormField>
        {admissions.length === 0 && (
          <div className="rounded-lg bg-amber-50 p-4 table-data font-semibold text-amber-700">
            No IP admissions are loaded. Create or convert an IP admission
            first.
          </div>
        )}
        <CaseFields />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="close-button font-bold"
          >
            Cancel
          </button>
          <Button disabled={busy}>Create IP Physio Case</Button>
        </div>
      </form>
    </Card>
  );
}