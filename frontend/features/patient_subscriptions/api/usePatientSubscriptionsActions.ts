"use client";

import type { ApiSession } from "@/lib/api";
import { today } from "@/utils/helper";
import {
  codeFromName,
  mapQuantitiesToIds,
  parsePharmacySlabs,
  sameName,
} from "../../patients/helpers";
import * as patientSubscriptionsApi from "./patientSubscriptions.api";

type Toast = { text: string; kind: "success" | "error" | "warn" } | null;

type UsePatientSubscriptionsActionsParams = {
  apiSession: ApiSession | null | undefined;
  branchId?: string;
  labTests: any[];
  medicines: any[];
  patientMap: Map<string, any>;
  canDeletePlans: boolean;
  busy: string;
  selectedPatient: string;
  selectedPlan: string;
  freeConsultDeptIds: string[];
  freeLabTestIds: string[];
  freeLabQuantities: Record<string, number>;
  discountedLabTestIds: string[];
  freeMedicineIds: string[];
  freeMedicineQuantities: Record<string, number>;
  discountedMedicineIds: string[];
  editingPlan: any | null;
  editFreeConsultDeptIds: string[];
  editFreeLabIds: string[];
  editFreeLabQuantities: Record<string, number>;
  editDiscountedLabIds: string[];
  editFreeMedIds: string[];
  editFreeMedQuantities: Record<string, number>;
  editDiscountedMedIds: string[];
  setBusy: (value: string) => void;
  setToast: (value: Toast) => void;
  setView: (value: string) => void;
  setEditingPlan: (value: any | null) => void;
  setConfirmDelete: (value: string) => void;
  setDetailPlanId: (updater: (current: string) => string) => void;
  setFreeConsultDeptIds: (ids: string[]) => void;
  setFreeLabTestIds: (ids: string[]) => void;
  setFreeLabQuantities: (value: Record<string, number>) => void;
  setDiscountedLabTestIds: (ids: string[]) => void;
  setFreeMedicineIds: (ids: string[]) => void;
  setFreeMedicineQuantities: (value: Record<string, number>) => void;
  setDiscountedMedicineIds: (ids: string[]) => void;
  load: () => Promise<void>;
};

/**
 * Write actions for the patient-subscriptions workspace: plan create/edit/
 * toggle/delete (including on-the-fly lab test / medicine benefit
 * creation), enrollment create/update/cancel.
 */
export function usePatientSubscriptionsActions({
  apiSession,
  branchId,
  labTests,
  medicines,
  patientMap,
  canDeletePlans,
  busy,
  selectedPatient,
  selectedPlan,
  freeConsultDeptIds,
  freeLabTestIds,
  freeLabQuantities,
  discountedLabTestIds,
  freeMedicineIds,
  freeMedicineQuantities,
  discountedMedicineIds,
  editingPlan,
  editFreeConsultDeptIds,
  editFreeLabIds,
  editFreeLabQuantities,
  editDiscountedLabIds,
  editFreeMedIds,
  editFreeMedQuantities,
  editDiscountedMedIds,
  setBusy,
  setToast,
  setView,
  setEditingPlan,
  setConfirmDelete,
  setDetailPlanId,
  setFreeConsultDeptIds,
  setFreeLabTestIds,
  setFreeLabQuantities,
  setDiscountedLabTestIds,
  setFreeMedicineIds,
  setFreeMedicineQuantities,
  setDiscountedMedicineIds,
  load,
}: UsePatientSubscriptionsActionsParams) {
  async function resolveLabBenefitIds(values: string[], branchValue: string) {
    const resolved: string[] = [];
    for (const value of values) {
      if (!value.startsWith("new:")) {
        resolved.push(value);
        continue;
      }
      const name = value.slice(4).trim();
      if (!name) continue;
      const existing = labTests.find((row: any) => sameName(row, name));
      if (existing) {
        resolved.push(existing.id);
        continue;
      }
      const created = await patientSubscriptionsApi.createLabTest(
        apiSession as ApiSession,
        {
          branch_id: branchValue || branchId || null,
          code: codeFromName("LAB", name),
          name,
          department: "Membership Benefit",
          sample_type: null,
          default_price: 0,
          purchase_price: 0,
          created_by_user_id: (apiSession as ApiSession).user?.id,
        },
      );
      resolved.push(created.id);
    }
    return resolved;
  }

  async function resolveMedicineBenefitIds(
    values: string[],
    branchValue: string,
  ) {
    const resolved: string[] = [];
    for (const value of values) {
      if (!value.startsWith("new:")) {
        resolved.push(value);
        continue;
      }
      const name = value.slice(4).trim();
      if (!name) continue;
      const existing = medicines.find((row: any) => sameName(row, name));
      if (existing) {
        resolved.push(existing.id);
        continue;
      }
      const created = await patientSubscriptionsApi.createMedicine(
        apiSession as ApiSession,
        {
          branch_id: branchValue || branchId || null,
          code: codeFromName("MED", name),
          name,
          generic_name: null,
          form: "Tablet",
          default_sale_price: 0,
          purchase_price: 0,
          reorder_level: 0,
          created_by_user_id: (apiSession as ApiSession).user?.id,
        },
      );
      resolved.push(created.id);
    }
    return resolved;
  }

  async function createPlan(form: HTMLFormElement) {
    const fd = new FormData(form);
    if (busy === "plan") return;
    setBusy("plan");
    setToast(null);
    try {
      const basePayload = {
        name: fd.get("name"),
        code: fd.get("code") || null,
        price_amount: Number(fd.get("priceAmount") || 0),
        duration_days: Number(fd.get("durationDays") || 0),
        activation_after_days: Number(fd.get("activationAfterDays") || 0),
        free_consultations: Number(fd.get("freeConsultations") || 0),
        free_consultation_department_ids: freeConsultDeptIds,
        lab_discount_percentage: Number(fd.get("labDiscount") || 0),
        pharmacy_discount_percentage: Number(fd.get("pharmacyDiscount") || 0),
        min_discount_amount: Number(fd.get("minDiscountAmount") || 0),
        pharmacy_discount_slabs: parsePharmacySlabs(fd),
        created_by_user_id: (apiSession as ApiSession).user?.id,
      };
      const freeLabIds = await resolveLabBenefitIds(
        freeLabTestIds,
        branchId || "",
      );
      const discountedLabIds = await resolveLabBenefitIds(
        discountedLabTestIds,
        branchId || "",
      );
      const freeMedIds = await resolveMedicineBenefitIds(
        freeMedicineIds,
        branchId || "",
      );
      const discountedMedIds = await resolveMedicineBenefitIds(
        discountedMedicineIds,
        branchId || "",
      );
      await patientSubscriptionsApi.createPlan(apiSession as ApiSession, {
        ...basePayload,
        branch_id: null,
        free_lab_test_ids: freeLabIds,
        free_lab_test_quantities: mapQuantitiesToIds(
          freeLabTestIds,
          freeLabIds,
          freeLabQuantities,
        ),
        discounted_lab_test_ids: discountedLabIds,
        free_medicine_ids: freeMedIds,
        free_medicine_quantities: mapQuantitiesToIds(
          freeMedicineIds,
          freeMedIds,
          freeMedicineQuantities,
        ),
        discounted_medicine_ids: discountedMedIds,
      });
      form.reset();
      setFreeConsultDeptIds([]);
      setFreeLabTestIds([]);
      setFreeLabQuantities({});
      setDiscountedLabTestIds([]);
      setFreeMedicineIds([]);
      setFreeMedicineQuantities({});
      setDiscountedMedicineIds([]);
      setView("list");
      await load();
      setToast({
        text: "Tenant-scoped patient subscription plan created.",
        kind: "success",
      });
    } catch (err: any) {
      setToast({
        text: err.message || "Could not create plan.",
        kind: "error",
      });
    } finally {
      setBusy("");
    }
  }

  async function enroll(event: any) {
    event.preventDefault();
    if (!selectedPatient || !selectedPlan) {
      setToast({ text: "Select patient and plan.", kind: "warn" });
      return;
    }
    setBusy("enroll");
    setToast(null);
    try {
      const created = await patientSubscriptionsApi.createEnrollment(
        apiSession as ApiSession,
        {
          branch_id: branchId,
          patient_id: selectedPatient,
          plan_id: selectedPlan,
          starts_on: today(),
          created_by_user_id: (apiSession as ApiSession).user?.id,
        },
      );
      await load();
      setToast({
        text:
          created?.status === "queued"
            ? "Patient already has an active plan — this one is queued and will activate automatically once it ends."
            : "Patient enrolled in subscription plan.",
        kind: "success",
      });
    } catch (err: any) {
      setToast({
        text: err.message || "Could not enroll patient.",
        kind: "error",
      });
    } finally {
      setBusy("");
    }
  }

  async function updatePlan(form: HTMLFormElement) {
    if (!editingPlan) return;
    const fd = new FormData(form);
    setBusy("edit");
    setToast(null);
    try {
      await patientSubscriptionsApi.updatePlan(
        apiSession as ApiSession,
        editingPlan.id,
        {
          name: fd.get("name"),
          code: fd.get("code") || null,
          price_amount: Number(fd.get("priceAmount") || 0),
          duration_days: Number(fd.get("durationDays") || 0),
          activation_after_days: Number(fd.get("activationAfterDays") || 0),
          free_consultations: Number(fd.get("freeConsultations") || 0),
          free_consultation_department_ids: editFreeConsultDeptIds,
          lab_discount_percentage: Number(fd.get("labDiscount") || 0),
          pharmacy_discount_percentage: Number(
            fd.get("pharmacyDiscount") || 0,
          ),
          min_discount_amount: Number(fd.get("minDiscountAmount") || 0),
          pharmacy_discount_slabs: parsePharmacySlabs(fd),
          free_lab_test_ids: editFreeLabIds,
          free_lab_test_quantities: mapQuantitiesToIds(
            editFreeLabIds,
            editFreeLabIds,
            editFreeLabQuantities,
          ),
          discounted_lab_test_ids: editDiscountedLabIds,
          free_medicine_ids: editFreeMedIds,
          free_medicine_quantities: mapQuantitiesToIds(
            editFreeMedIds,
            editFreeMedIds,
            editFreeMedQuantities,
          ),
          discounted_medicine_ids: editDiscountedMedIds,
          updated_by_user_id: (apiSession as ApiSession).user?.id,
        },
      );
      setEditingPlan(null);
      setView("list");
      await load();
      setToast({ text: "Plan updated successfully.", kind: "success" });
    } catch (err: any) {
      setToast({
        text: err.message || "Could not update plan.",
        kind: "error",
      });
    } finally {
      setBusy("");
    }
  }

  async function togglePlanActive(plan: any) {
    setBusy(`toggle-${plan.id}`);
    setToast(null);
    try {
      await patientSubscriptionsApi.updatePlan(
        apiSession as ApiSession,
        plan.id,
        {
          is_active: !plan.is_active,
          updated_by_user_id: (apiSession as ApiSession).user?.id,
        },
      );
      await load();
      setToast({
        text: `Plan ${plan.is_active ? "paused" : "activated"}.`,
        kind: "success",
      });
    } catch (err: any) {
      setToast({
        text: err.message || "Could not update plan status.",
        kind: "error",
      });
    } finally {
      setBusy("");
    }
  }

  async function deletePlan(planId: string) {
    setBusy(`delete-${planId}`);
    setToast(null);
    try {
      await patientSubscriptionsApi.deletePlan(
        apiSession as ApiSession,
        planId,
      );
      setConfirmDelete("");
      setDetailPlanId((current) => (current === planId ? "" : current));
      await load();
      setToast({ text: "Plan deactivated.", kind: "success" });
    } catch (err: any) {
      const message = String(err.message || "");
      setToast({
        text: message || "Could not deactivate plan.",
        kind: "error",
      });
      setConfirmDelete("");
    } finally {
      setBusy("");
    }
  }

  async function updateEnrollment(row: any, updates: any) {
    if (!canDeletePlans) {
      setToast({ kind: "warn", text: "Tenant admin access required." });
      return;
    }
    setBusy(`enrollment-${row.id}`);
    setToast(null);
    try {
      await patientSubscriptionsApi.updateEnrollment(
        apiSession as ApiSession,
        row.id,
        {
          ...updates,
          updated_by_user_id: (apiSession as ApiSession).user?.id,
        },
      );
      await load();
      setToast({ kind: "success", text: "Enrollment updated." });
    } catch (err: any) {
      setToast({
        kind: "error",
        text: err.message || "Could not update enrollment.",
      });
    } finally {
      setBusy("");
    }
  }

  function cancelEnrollment(row: any) {
    const patientName =
      row.patient_name ||
      patientMap.get(row.patient_id)?.name ||
      patientMap.get(row.patient_id)?.full_name ||
      "this patient";
    const planName = row.plan?.name || "membership plan";
    updateEnrollment(row, {
      status: "cancelled",
      ends_on: today(),
    });
  }

  return {
    createPlan,
    enroll,
    updatePlan,
    togglePlanActive,
    deletePlan,
    updateEnrollment,
    cancelEnrollment,
  };
}
