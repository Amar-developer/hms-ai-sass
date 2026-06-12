import { patientFormPayload } from "@/features/patients/PatientFormFields";
import { Card, Button } from "../common/ui";
import { PatientFormFields } from "@/features/patients/PatientFormFields";
import {
  TextField,
  NumberField,
  SelectField,
  DateField,
} from "../FormElements";
import { paymentMethodOptions } from "@/lib/options";
import { useState } from "react";

export function PatientForm({
  title,
  patient,
  branches,
  defaultBranchId,
  busy,
  onSubmit,
  back,
}: any) {
  function handleSubmit(event: any) {
    event.preventDefault();
    onSubmit(patientFormPayload(new FormData(event.currentTarget)));
  }

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="card-title font-bold">{title}</h3>
          <p className="table-data text-slate-500">
            {patient?.patient_number || "Create tenant-scoped patient record."}
          </p>
        </div>
        <button type="button" onClick={back} className="close-button font-bold">
          Back
        </button>
      </div>
      <form
        onSubmit={handleSubmit}
        className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <PatientFormFields
          patient={patient}
          branches={branches}
          defaultBranchId={defaultBranchId}
          includeStatus={Boolean(patient)}
        />
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3">
          <Button disabled={busy}>
            {busy ? "Saving..." : patient ? "Save Patient" : "Create Patient"}
          </Button>
          <button
            type="button"
            onClick={back}
            className="close-button font-bold"
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}

export function MembershipEnrollForm({
  membershipPlans,
  patient,
  loading,
  onSubmit,
}: any) {
  const activePlans = membershipPlans.filter((plan: any) => plan.is_active);
  const [planId, setPlanId] = useState("");
  const [branchId, setBranchId] = useState(patient?.branch_id || "");
  const [startsOn, setStartsOn] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");

  function handleSubmit(e: any) {
    e.preventDefault();
    onSubmit({ planId, branchId, startsOn, paidAmount, paymentMethod });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 grid gap-3 md:grid-cols-5">
      <SelectField
        label="Plan"
        value={planId}
        onChange={setPlanId}
        options={[
          { value: "", label: "Select plan" },
          ...activePlans.map((plan: any) => ({
            value: plan.id,
            label: `${plan.name} · ₹${Number(plan.price_amount || 0).toLocaleString("en-IN")}`,
          })),
        ]}
      />
      <TextField
        label="Branch ID"
        value={branchId}
        onChange={setBranchId}
        className="search-input"
      />
      <DateField label="Starts On" value={startsOn} onChange={setStartsOn} />
      <NumberField
        label="Amount Paid Now"
        value={paidAmount}
        onChange={setPaidAmount}
        min={0}
        placeholder="0 if unpaid"
      />
      <SelectField
        label="Payment Method"
        value={paymentMethod}
        onChange={setPaymentMethod}
        options={[...paymentMethodOptions]}
      />
      <div className="md:col-span-5">
        <Button disabled={loading || activePlans.length === 0}>
          {loading ? "Saving..." : "Enroll Membership"}
        </Button>
      </div>
    </form>
  );
}
