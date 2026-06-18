"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionButton,
  Badge,
  Button,
  Card,
  Input,
  RefreshButton,
  SearchableSelect,
  Select,
  StatusToast,
} from "@/components/common/ui";
import { FormField } from "@/components/FormElements";
import { apiFetch } from "@/lib/api";
import { uniqueDepartmentRows } from "@/lib/options";
import { displayDate } from "@/utils/helper";

function money(value: any) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}
function codeFromName(prefix: string, name: string) {
  const clean =
    String(name || "ITEM")
      .replace(/[^a-z0-9]/gi, "")
      .toUpperCase()
      .slice(0, 18) || "ITEM";
  return `${prefix}${clean}${Date.now().toString().slice(-4)}`.slice(0, 40);
}
function sameName(row: any, name: string) {
  return (
    String(row?.name || "")
      .trim()
      .toLowerCase() ===
    String(name || "")
      .trim()
      .toLowerCase()
  );
}
function benefitLabel(value: any, rows: any[]) {
  const row = rows.find((item: any) => item.id === value);
  return row?.name || value;
}
// Re-key a quantity map from picker selection values onto resolved backend ids.
// resolveLabBenefitIds/resolveMedicineBenefitIds preserve order, so zip by index.
function mapQuantitiesToIds(
  selectionValues: string[],
  resolvedIds: string[],
  quantities: Record<string, number>,
) {
  const result: Record<string, number> = {};
  resolvedIds.forEach((id: string, index: number) => {
    const selectionValue = selectionValues[index];
    result[id] = Math.max(Number(quantities?.[selectionValue]) || 1, 1);
  });
  return result;
}

function normalizePharmacySlabs(slabs: any[]) {
  const rows = (slabs || [])
    .map((slab: any) => ({
      min_amount: Number(slab?.min_amount || 0),
      max_amount:
        slab?.max_amount === null || slab?.max_amount === undefined
          ? null
          : Number(slab.max_amount),
      discount_percentage: Number(slab?.discount_percentage || 0),
    }))
    .filter((slab) => slab.discount_percentage > 0);
  return rows.length ? rows : [{ min_amount: 0, max_amount: null, discount_percentage: 0 }];
}

function parsePharmacySlabs(fd: FormData) {
  const minAmounts = fd.getAll("pharmacySlabMin");
  const maxAmounts = fd.getAll("pharmacySlabMax");
  const discounts = fd.getAll("pharmacySlabDiscount");
  return minAmounts
    .map((value, index) => {
      const minAmount = Number(value || 0);
      const maxText = String(maxAmounts[index] || "").trim();
      const discount = Number(discounts[index] || 0);
      if (discount <= 0) return null;
      return {
        min_amount: Math.max(minAmount, 0),
        max_amount: maxText ? Math.max(Number(maxText), 0) : null,
        discount_percentage: Math.min(Math.max(discount, 0), 100),
      };
    })
    .filter(Boolean);
}

function pharmacyBenefitLabel(plan: any) {
  const slabs = plan?.pharmacy_discount_slabs || [];
  if (slabs.length) {
    return slabs
      .map(
        (slab: any) =>
          `${slab.discount_percentage || 0}% ₹${slab.min_amount || 0}-${slab.max_amount ?? "above"}`,
      )
      .join(", ");
  }
  return `${plan?.pharmacy_discount_percentage || 0}%`;
}

function canDeleteMembershipPlans(user: any) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return (
    Boolean(user?.is_super_admin) ||
    user?.user_type === "tenant_admin" ||
    roles.includes("tenant_admin")
  );
}

const enrollmentPageSize = 10;

export function PatientSubscriptions({
  apiSession,
  branchId,
  branches,
  clinic,
  patients,
  showEnrollment = false,
}: any) {
  const [plans, setPlans] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [labTests, setLabTests] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [view, setView] = useState("list");
  const [toast, setToast] = useState<{
    text: string;
    kind: "success" | "error" | "warn";
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedPatient, setSelectedPatient] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [freeConsultDeptIds, setFreeConsultDeptIds] = useState<string[]>([]);
  const [editFreeConsultDeptIds, setEditFreeConsultDeptIds] = useState<string[]>(
    [],
  );
  const [freeLabTestIds, setFreeLabTestIds] = useState<string[]>([]);
  const [freeLabQuantities, setFreeLabQuantities] = useState<
    Record<string, number>
  >({});
  const [discountedLabTestIds, setDiscountedLabTestIds] = useState<string[]>(
    [],
  );
  const [freeMedicineIds, setFreeMedicineIds] = useState<string[]>([]);
  const [freeMedicineQuantities, setFreeMedicineQuantities] = useState<
    Record<string, number>
  >({});
  const [discountedMedicineIds, setDiscountedMedicineIds] = useState<string[]>(
    [],
  );
  const [editingPlan, setEditingPlan] = useState<any | null>(null);
  const [editFreeLabIds, setEditFreeLabIds] = useState<string[]>([]);
  const [editFreeLabQuantities, setEditFreeLabQuantities] = useState<
    Record<string, number>
  >({});
  const [editDiscountedLabIds, setEditDiscountedLabIds] = useState<string[]>(
    [],
  );
  const [editFreeMedIds, setEditFreeMedIds] = useState<string[]>([]);
  const [editFreeMedQuantities, setEditFreeMedQuantities] = useState<
    Record<string, number>
  >({});
  const [editDiscountedMedIds, setEditDiscountedMedIds] = useState<string[]>(
    [],
  );
  const [confirmDelete, setConfirmDelete] = useState("");
  const [detailPlanId, setDetailPlanId] = useState("");
  const patientMap = useMemo<Map<string, any>>(
    () => new Map((patients || []).map((p: any) => [p.id, p])),
    [patients],
  );
  async function load() {
    if (!apiSession) return;
    setLoadError("");
    try {
      const [planRows, enrollmentRows, testRows, medicineRows, departmentRows] =
        await Promise.all([
          apiFetch(
            "/patient-subscriptions/plans?include_inactive=true",
            apiSession,
          ),
          apiFetch("/patient-subscriptions/enrollments", apiSession),
          apiFetch(
            `/lab/catalog/tests?branch_id=${encodeURIComponent(branchId || "")}`,
            apiSession,
          ).catch(() => []),
          apiFetch(
            `/pharmacy/medicines?branch_id=${encodeURIComponent(branchId || "")}`,
            apiSession,
          ).catch(() => []),
          apiFetch(
            `/tenants/${apiSession.tenantId}/departments`,
            apiSession,
          ).catch(() => []),
        ]);
      setPlans(planRows);
      setEnrollments(enrollmentRows);
      setLabTests(testRows);
      setMedicines(medicineRows);
      setDepartments(
        uniqueDepartmentRows(
          (departmentRows || []).filter((dept: any) => dept?.is_active !== false),
        ),
      );
      setDetailPlanId((current) =>
        planRows.some((row: any) => row.id === current) ? current : "",
      );
      setSelectedPlan((current) =>
        planRows.some((row: any) => row.id === current)
          ? current
          : planRows[0]?.id || "",
      );
      setSelectedPatient((current) =>
        patients?.some((row: any) => row.id === current)
          ? current
          : patients?.[0]?.id || "",
      );
    } catch (err: any) {
      const msg = err.message || "Could not load patient subscriptions.";
      setLoadError(msg);
    }
  }

  useEffect(() => {
    load();
  }, [apiSession?.token, apiSession?.tenantId, branchId, patients?.length]);

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
      const created = await apiFetch("/lab/catalog/tests", apiSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: branchValue || branchId || null,
          code: codeFromName("LAB", name),
          name,
          department: "Membership Benefit",
          sample_type: null,
          default_price: 0,
          purchase_price: 0,
          created_by_user_id: apiSession.user?.id,
        }),
      });
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
      const created = await apiFetch("/pharmacy/medicines", apiSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: branchValue || branchId || null,
          code: codeFromName("MED", name),
          name,
          generic_name: null,
          form: "Tablet",
          default_sale_price: 0,
          purchase_price: 0,
          reorder_level: 0,
          created_by_user_id: apiSession.user?.id,
        }),
      });
      resolved.push(created.id);
    }
    return resolved;
  }

  async function createPlan(event: any) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
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
        created_by_user_id: apiSession.user?.id,
      };
      const freeLabIds = await resolveLabBenefitIds(freeLabTestIds, branchId || "");
      const discountedLabIds = await resolveLabBenefitIds(discountedLabTestIds, branchId || "");
      const freeMedIds = await resolveMedicineBenefitIds(freeMedicineIds, branchId || "");
      const discountedMedIds = await resolveMedicineBenefitIds(discountedMedicineIds, branchId || "");
      await apiFetch("/patient-subscriptions/plans", apiSession, {
        method: "POST",
        body: JSON.stringify({
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
        }),
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
      await apiFetch("/patient-subscriptions/enrollments", apiSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: branchId,
          patient_id: selectedPatient,
          plan_id: selectedPlan,
          starts_on: new Date().toISOString().slice(0, 10),
          created_by_user_id: apiSession.user?.id,
        }),
      });
      await load();
      setToast({
        text: "Patient enrolled in subscription plan.",
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

  function startEdit(plan: any) {
    setEditingPlan(plan);
    setView("edit");
    setEditFreeConsultDeptIds(plan.free_consultation_department_ids || []);
    setEditFreeLabIds(plan.free_lab_test_ids || []);
    setEditFreeLabQuantities(plan.free_lab_test_quantities || {});
    setEditDiscountedLabIds(plan.discounted_lab_test_ids || []);
    setEditFreeMedIds(plan.free_medicine_ids || []);
    setEditFreeMedQuantities(plan.free_medicine_quantities || {});
    setEditDiscountedMedIds(plan.discounted_medicine_ids || []);
    setToast(null);
  }

  function cancelEdit() {
    setEditingPlan(null);
    setConfirmDelete("");
    setView("list");
  }

  async function updatePlan(event: any) {
    event.preventDefault();
    if (!editingPlan) return;
    const fd = new FormData(event.currentTarget);
    setBusy("edit");
    setToast(null);
    try {
      await apiFetch(
        `/patient-subscriptions/plans/${editingPlan.id}`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({
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
            updated_by_user_id: apiSession.user?.id,
          }),
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
      await apiFetch(`/patient-subscriptions/plans/${plan.id}`, apiSession, {
        method: "PATCH",
        body: JSON.stringify({
          is_active: !plan.is_active,
          updated_by_user_id: apiSession.user?.id,
        }),
      });
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
      await apiFetch(`/patient-subscriptions/plans/${planId}`, apiSession, {
        method: "DELETE",
      });
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
      await apiFetch(`/patient-subscriptions/enrollments/${row.id}`, apiSession, {
        method: "PATCH",
        body: JSON.stringify({
          ...updates,
          updated_by_user_id: apiSession.user?.id,
        }),
      });
      await load();
      setToast({ kind: "success", text: "Enrollment updated." });
    } catch (err: any) {
      setToast({ kind: "error", text: err.message || "Could not update enrollment." });
    } finally {
      setBusy("");
    }
  }

  function cancelEnrollment(row: any) {
    const patientName =
      patientMap.get(row.patient_id)?.name ||
      patientMap.get(row.patient_id)?.full_name ||
      "this patient";
    const planName = row.plan?.name || "membership plan";
    if (!window.confirm(`Cancel ${planName} enrollment for ${patientName}?`)) {
      return;
    }
    updateEnrollment(row, {
      status: "cancelled",
      ends_on: new Date().toISOString().slice(0, 10),
    });
  }

  if (!apiSession)
    return (
      <Card>
        <h3 className="text-lg font-bold">Patient Subscriptions</h3>
        <p className="mt-2 text-sm text-slate-500">
          Backend login is required.
        </p>
      </Card>
    );

  const activeEnrollments = enrollments.filter(
    (row: any) => row.status === "active",
  );
  const canDeletePlans = canDeleteMembershipPlans(apiSession.user);
  const activeEnrollmentCountByPlan = useMemo(() => {
    const counts = new Map<string, number>();
    activeEnrollments.forEach((row: any) => {
      counts.set(row.plan_id, (counts.get(row.plan_id) || 0) + 1);
    });
    return counts;
  }, [activeEnrollments]);
  const detailPlan = detailPlanId
    ? plans.find((plan: any) => plan.id === detailPlanId)
    : null;

  function requestDeletePlan(plan: any) {
    setConfirmDelete(plan.id);
  }

  return (
    <div className="space-y-5">
      {loadError && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span className="font-bold">⚠ Could not load plans:</span>
          <span className="flex-1">{loadError}</span>
          <button type="button" className="font-bold underline" onClick={load}>
            Retry
          </button>
          <button
            type="button"
            className="ml-2 font-bold"
            onClick={() => setLoadError("")}
          >
            ✕
          </button>
        </div>
      )}
      <StatusToast
        message={toast?.text}
        tone={
          toast?.kind === "error"
            ? "error"
            : toast?.kind === "warn"
              ? "warning"
              : undefined
        }
        onClose={() => setToast(null)}
      />
      {view === "detail" && detailPlan && (
        <PlanDetailPage
          plan={detailPlan}
          labTests={labTests}
          medicines={medicines}
          departments={departments}
          onBack={() => {
            setDetailPlanId("");
            setView("list");
          }}
          onEdit={() => startEdit(detailPlan)}
          onToggle={() => togglePlanActive(detailPlan)}
          activeEnrollmentCount={
            activeEnrollmentCountByPlan.get(detailPlan.id) || 0
          }
        />
      )}
      {view === "create" && (
        <PlanForm
          title="Create Plan"
          apiSession={apiSession}
          busy={busy === "plan"}
          submitLabel="Create Plan"
          onSubmit={createPlan}
          back={() => setView("list")}
          labTests={labTests}
          medicines={medicines}
          departments={departments}
          freeConsultDeptIds={freeConsultDeptIds}
          setFreeConsultDeptIds={setFreeConsultDeptIds}
          freeLabTestIds={freeLabTestIds}
          setFreeLabTestIds={setFreeLabTestIds}
          freeLabQuantities={freeLabQuantities}
          setFreeLabQuantities={setFreeLabQuantities}
          discountedLabTestIds={discountedLabTestIds}
          setDiscountedLabTestIds={setDiscountedLabTestIds}
          freeMedicineIds={freeMedicineIds}
          setFreeMedicineIds={setFreeMedicineIds}
          freeMedicineQuantities={freeMedicineQuantities}
          setFreeMedicineQuantities={setFreeMedicineQuantities}
          discountedMedicineIds={discountedMedicineIds}
          setDiscountedMedicineIds={setDiscountedMedicineIds}
        />
      )}
      {view === "edit" && editingPlan && (
        <PlanForm
          title="Edit Plan"
          apiSession={apiSession}
          plan={editingPlan}
          busy={busy === "edit"}
          submitLabel="Save Changes"
          onSubmit={updatePlan}
          back={cancelEdit}
          labTests={labTests}
          medicines={medicines}
          departments={departments}
          freeConsultDeptIds={editFreeConsultDeptIds}
          setFreeConsultDeptIds={setEditFreeConsultDeptIds}
          freeLabTestIds={editFreeLabIds}
          setFreeLabTestIds={setEditFreeLabIds}
          freeLabQuantities={editFreeLabQuantities}
          setFreeLabQuantities={setEditFreeLabQuantities}
          discountedLabTestIds={editDiscountedLabIds}
          setDiscountedLabTestIds={setEditDiscountedLabIds}
          freeMedicineIds={editFreeMedIds}
          setFreeMedicineIds={setEditFreeMedIds}
          freeMedicineQuantities={editFreeMedQuantities}
          setFreeMedicineQuantities={setEditFreeMedQuantities}
          discountedMedicineIds={editDiscountedMedIds}
          setDiscountedMedicineIds={setEditDiscountedMedIds}
        />
      )}
      {view === "list" && (
        <>
          {showEnrollment && (
            <Card>
              <h3 className="text-lg font-bold">Enroll Patient</h3>
              <form
                onSubmit={enroll}
                className="mt-4 grid gap-3 md:grid-cols-3"
              >
                <FormField label="Patient">
                  <SearchableSelect
                    value={selectedPatient}
                    onChange={(value: string) => setSelectedPatient(value)}
                    placeholder="Select patient"
                    searchPlaceholder="Search patient by name"
                    options={(patients || []).map((p: any) => ({
                      value: p.id,
                      label: p.name || p.full_name || p.id,
                    }))}
                  />
                </FormField>
                <FormField label="Plan">
                  <Select
                    value={selectedPlan}
                    onChange={(e: any) => setSelectedPlan(e.target.value)}
                  >
                    {plans
                      .filter((p: any) => p.is_active)
                      .map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {money(p.price_amount)}
                        </option>
                      ))}
                  </Select>
                </FormField>
                <div className="flex items-end">
                  <Button disabled={busy === "enroll"}>
                    {busy === "enroll" ? "Enrolling..." : "Enroll"}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          <Card>
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
              <div>
                <h3 className="text-base lg:text-lg font-bold">Plans</h3>
                <p className="text-xs lg:text-sm text-slate-500">
                  Create and manage branch-specific patient membership plans.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <RefreshButton onRefresh={load} />
                <Button
                  type="button"
                  onClick={() => setView("create")}
                  className="w-full rounded-lg px-3 py-2 text-xs sm:w-auto lg:px-4 lg:py-3 lg:text-sm"
                >
                  Create Plan
                </Button>
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
              {plans.length === 0 && (
                <p className="p-4 text-sm text-slate-500">
                  No patient plans yet.
                </p>
              )}
              {plans.length > 0 && (
                <div>
                  <div className="hidden min-w-full overflow-x-auto lg:block">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Plan</th>
                          <th className="px-4 py-3">Price</th>
                          <th className="px-4 py-3">Duration</th>
                          <th className="px-4 py-3">Consults</th>
                          <th className="px-4 py-3">Scope</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {plans.map((plan: any) => {
                          const activeEnrollmentCount =
                            activeEnrollmentCountByPlan.get(plan.id) || 0;
                          return (
                            <PlanTableRow
                              key={plan.id}
                              plan={plan}
                              activeEnrollmentCount={activeEnrollmentCount}
                              busy={busy}
                              confirmDelete={confirmDelete}
                              setConfirmDelete={setConfirmDelete}
                              deletePlan={deletePlan}
                              requestDeletePlan={requestDeletePlan}
                              startEdit={startEdit}
                              togglePlanActive={togglePlanActive}
                              canDeletePlans={canDeletePlans}
                              openDetail={() => {
                                setDetailPlanId(plan.id);
                                setView("detail");
                              }}
                            />
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="divide-y divide-slate-100 lg:hidden">
                    {plans.map((plan: any) => {
                      const activeEnrollmentCount =
                        activeEnrollmentCountByPlan.get(plan.id) || 0;
                      return (
                        <PlanMobileRow
                          key={plan.id}
                          plan={plan}
                          activeEnrollmentCount={activeEnrollmentCount}
                          busy={busy}
                          confirmDelete={confirmDelete}
                          setConfirmDelete={setConfirmDelete}
                          deletePlan={deletePlan}
                          requestDeletePlan={requestDeletePlan}
                          startEdit={startEdit}
                          togglePlanActive={togglePlanActive}
                          canDeletePlans={canDeletePlans}
                          openDetail={() => {
                            setDetailPlanId(plan.id);
                            setView("detail");
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </Card>
          <ActiveEnrollmentsTable
            rows={activeEnrollments}
            patientMap={patientMap}
            canManage={canDeletePlans}
            busy={busy}
            onUpdate={updateEnrollment}
            onCancel={cancelEnrollment}
          />
        </>
      )}
    </div>
  );
}

function BenefitPicker({
  label,
  kind,
  rows,
  selected,
  onChange,
  priceKey,
  emptyHint,
  apiSession,
  searchPath,
  quantities,
  onQuantityChange,
}: any) {
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<any[]>([]);
  const normalized = query.trim().toLowerCase();
  const selectedSet = new Set(selected);
  const filtered = (rows || [])
    .filter(
      (row: any) =>
        !selectedSet.has(row.id) &&
        [row.name, row.code, row.generic_name, row.department, row.form]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalized),
    )
    .slice(0, 8);
  const exact = (rows || []).some((row: any) => sameName(row, query));
  const localNames = new Set(
    (rows || []).map((r: any) =>
      String(r.name || "")
        .trim()
        .toLowerCase(),
    ),
  );
  const remoteSuggestions = (remote || [])
    .filter(
      (r: any) =>
        r?.name && !localNames.has(String(r.name).trim().toLowerCase()),
    )
    .slice(0, 8);
  useEffect(() => {
    const q = query.trim();
    if (!apiSession || !searchPath || q.length < 2) {
      setRemote([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      const sep = searchPath.includes("?") ? "&" : "?";
      apiFetch(
        `${searchPath}${sep}search=${encodeURIComponent(q)}&page_size=10`,
        apiSession,
      )
        .then((data: any) => {
          if (alive) setRemote(Array.isArray(data) ? data : data?.items || []);
        })
        .catch(() => {
          if (alive) setRemote([]);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, apiSession, searchPath]);
  function add(value: string) {
    if (!value || selectedSet.has(value)) return;
    onChange([...selected, value]);
    setQuery("");
    setRemote([]);
  }
  function remove(value: string) {
    onChange(selected.filter((item: string) => item !== value));
  }
  function addRemote(item: any) {
    const local = (rows || []).find((r: any) => sameName(r, item.name));
    add(local ? local.id : `new:${String(item.name).trim()}`);
  }
  return (
    <div>
      <FormField label={label}>
        <Input
          value={query}
          onChange={(e: any) => setQuery(e.target.value)}
          placeholder={`Search existing ${kind} or type new name`}
        />
      </FormField>
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selected.map((value: string) => {
            const itemLabel = value.startsWith("new:")
              ? value.slice(4)
              : benefitLabel(value, rows);
            if (!onQuantityChange) {
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => remove(value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
                >
                  {itemLabel} ×
                </button>
              );
            }
            return (
              <span
                key={value}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
              >
                <span>{itemLabel}</span>
                <span className="flex items-center gap-1 text-slate-500">
                  free ×
                  <input
                    type="number"
                    min={1}
                    value={Number(quantities?.[value]) || 1}
                    onChange={(e: any) =>
                      onQuantityChange(value, Math.max(Number(e.target.value) || 1, 1))
                    }
                    className="w-12 rounded-lg border border-slate-200 px-1 py-0.5 text-center text-xs font-bold text-slate-700"
                  />
                </span>
                <button
                  type="button"
                  onClick={() => remove(value)}
                  className="text-slate-400 hover:text-red-500"
                  aria-label={`Remove ${itemLabel}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      {query && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
          <div className="max-h-56 overflow-auto">
            {filtered.length === 0 && remoteSuggestions.length === 0 && (
              <p className="px-3 py-2 text-sm text-slate-500">
                No matching {kind} found.
              </p>
            )}
            {filtered.map((row: any) => (
              <button
                key={row.id}
                type="button"
                onClick={() => add(row.id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span>
                  <b>{row.name}</b>
                  <span className="block text-xs text-slate-500">
                    {[row.code, row.generic_name, row.department, row.form]
                      .filter(Boolean)
                      .join(" · ") || row.id}
                  </span>
                </span>
                <span className="text-xs font-bold">
                  {money(row[priceKey])}
                </span>
              </button>
            ))}
            {remoteSuggestions.map((item: any, index: number) => (
              <button
                key={`remote-${item.id || item.slug || index}`}
                type="button"
                onClick={() => addRemote(item)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span>
                  <b>{item.name}</b>
                  <span className="block text-xs text-slate-500">
                    {[item.code, item.generic_name, item.department]
                      .filter(Boolean)
                      .join(" · ") || "External catalog"}
                  </span>
                </span>
                <Badge tone="blue">External</Badge>
              </button>
            ))}
          </div>
          {query.trim() && !exact && (
            <button
              type="button"
              onClick={() => add(`new:${query.trim()}`)}
              className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-sm font-bold text-white"
            >
              Add new {kind}: {query.trim()}
            </button>
          )}
        </div>
      )}
      {emptyHint && selected.length === 0 && (
        <p className="mt-2 text-xs text-slate-500">{emptyHint}</p>
      )}
    </div>
  );
}

function PlanForm({
  title,
  plan,
  busy,
  submitLabel,
  onSubmit,
  back,
  labTests,
  medicines,
  departments,
  freeConsultDeptIds,
  setFreeConsultDeptIds,
  freeLabTestIds,
  setFreeLabTestIds,
  freeLabQuantities,
  setFreeLabQuantities,
  discountedLabTestIds,
  setDiscountedLabTestIds,
  freeMedicineIds,
  setFreeMedicineIds,
  freeMedicineQuantities,
  setFreeMedicineQuantities,
  discountedMedicineIds,
  setDiscountedMedicineIds,
  apiSession,
}: any) {
  const [pharmacySlabs, setPharmacySlabs] = useState<any[]>(() =>
    normalizePharmacySlabs(plan?.pharmacy_discount_slabs || []),
  );

  useEffect(() => {
    setPharmacySlabs(
      normalizePharmacySlabs(plan?.pharmacy_discount_slabs || []),
    );
  }, [plan?.id]);

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="text-sm text-slate-500">
            {plan
              ? "Update this membership plan."
              : "Create one tenant-scoped membership plan for all branches."}
          </p>
        </div>
        <button
          type="button"
          onClick={back}
          className="rounded-lg border px-4 py-3 text-sm font-bold"
        >
          Back to Plans
        </button>
      </div>
      <form
        onSubmit={onSubmit}
        className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        <FormField label="Plan Name">
          <Input
            name="name"
            defaultValue={plan?.name || ""}
            placeholder="Membership plan name"
            required
          />
        </FormField>
        <FormField label="Code">
          <Input
            name="code"
            defaultValue={plan?.code || ""}
            placeholder="Optional plan code"
          />
        </FormField>
        <FormField label="Price">
          <Input
            name="priceAmount"
            type="number"
            min="0"
            defaultValue={plan?.price_amount ?? 0}
          />
        </FormField>
        <FormField label="Duration Days">
          <Input
            name="durationDays"
            type="number"
            min="1"
            defaultValue={plan?.duration_days ?? ""}
            required
          />
        </FormField>
        <FormField label="Activation After Days">
          <Input
            name="activationAfterDays"
            type="number"
            min="0"
            defaultValue={plan?.activation_after_days ?? 0}
          />
        </FormField>
        <FormField label="Free Consultations">
          <Input
            name="freeConsultations"
            type="number"
            min="0"
            defaultValue={plan?.free_consultations ?? 0}
          />
        </FormField>
        <div className="md:col-span-2">
          <FormField label="Free Consultation Departments">
            <div className="flex flex-wrap gap-2">
              {(departments || []).length === 0 && (
                <span className="text-xs text-slate-400">
                  No medical departments available.
                </span>
              )}
              {(departments || []).map((dept: any) => {
                const selected = (freeConsultDeptIds || []).includes(dept.id);
                return (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() =>
                      setFreeConsultDeptIds((prev: string[]) =>
                        (prev || []).includes(dept.id)
                          ? prev.filter((id: string) => id !== dept.id)
                          : [...(prev || []), dept.id],
                      )
                    }
                    className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                      selected
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {dept.name}
                  </button>
                );
              })}
            </div>
          </FormField>
          <p className="mt-1 text-xs text-slate-500">
            Leave empty to allow free consultations in any department. Select one
            or more (e.g. General Medicine) to restrict the free consultation
            benefit to those departments only.
          </p>
        </div>
        <FormField label="Lab Discount %">
          <Input
            name="labDiscount"
            type="number"
            min="0"
            max="100"
            defaultValue={plan?.lab_discount_percentage ?? 0}
          />
        </FormField>
        <FormField label="Pharmacy Discount %">
          <Input
            name="pharmacyDiscount"
            type="number"
            min="0"
            max="100"
            defaultValue={plan?.pharmacy_discount_percentage ?? 0}
          />
        </FormField>
        <FormField label="Min Bill for % Discount (₹)">
          <Input
            name="minDiscountAmount"
            type="number"
            min="0"
            defaultValue={plan?.min_discount_amount ?? 0}
            placeholder="0 = no minimum"
          />
        </FormField>
        <div className="md:col-span-2 xl:col-span-4">
          <PharmacySlabEditor
            slabs={pharmacySlabs}
            onChange={setPharmacySlabs}
          />
        </div>
        <div className="md:col-span-2">
          <BenefitPicker
            label="Free Lab Tests"
            kind="lab test"
            rows={labTests}
            selected={freeLabTestIds}
            onChange={setFreeLabTestIds}
            quantities={freeLabQuantities}
            onQuantityChange={(value: string, qty: number) =>
              setFreeLabQuantities((prev: any) => ({ ...prev, [value]: qty }))
            }
            priceKey="default_price"
            apiSession={apiSession}
            searchPath="/lab/catalog/available-tests"
          />
        </div>
        <div className="md:col-span-2">
          <BenefitPicker
            label="Discounted Lab Tests"
            kind="lab test"
            rows={labTests}
            selected={discountedLabTestIds}
            onChange={setDiscountedLabTestIds}
            priceKey="default_price"
            emptyHint="Leave empty to apply lab percentage to all lab tests."
            apiSession={apiSession}
            searchPath="/lab/catalog/available-tests"
          />
        </div>
        <div className="md:col-span-2">
          <BenefitPicker
            label="Free Tablets / Medicines"
            kind="medicine"
            rows={medicines}
            selected={freeMedicineIds}
            onChange={setFreeMedicineIds}
            quantities={freeMedicineQuantities}
            onQuantityChange={(value: string, qty: number) =>
              setFreeMedicineQuantities((prev: any) => ({ ...prev, [value]: qty }))
            }
            priceKey="default_sale_price"
            apiSession={apiSession}
            searchPath="/pharmacy/catalog/available-medicines"
          />
        </div>
        <div className="md:col-span-2">
          <BenefitPicker
            label="Discounted Tablets / Medicines"
            kind="medicine"
            rows={medicines}
            selected={discountedMedicineIds}
            onChange={setDiscountedMedicineIds}
            priceKey="default_sale_price"
            emptyHint="Leave empty to apply pharmacy percentage to all medicines."
            apiSession={apiSession}
            searchPath="/pharmacy/catalog/available-medicines"
          />
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-4">
          <Button disabled={busy}>{busy ? "Saving..." : submitLabel}</Button>
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

function PharmacySlabEditor({ slabs, onChange }: any) {
  function update(index: number, key: string, value: string) {
    const next = slabs.map((row: any, rowIndex: number) =>
      rowIndex === index
        ? {
            ...row,
            [key]:
              key === "max_amount" && value.trim() === ""
                ? null
                : Number(value || 0),
          }
        : row,
    );
    onChange(next);
  }

  function addRow() {
    onChange([...slabs, { min_amount: 0, max_amount: null, discount_percentage: 0 }]);
  }

  function removeRow(index: number) {
    const next = slabs.filter((_row: any, rowIndex: number) => rowIndex !== index);
    onChange(next.length ? next : [{ min_amount: 0, max_amount: null, discount_percentage: 0 }]);
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="card-title font-bold uppercase tracking-wide text-slate-500">
            Pharmacy Discount Slabs
          </p>
          <p className="text-xs text-slate-500">
            Add one row for each bill range. Leave To Amount empty for above.
          </p>
        </div>
        <ActionButton onClick={addRow}>Add Slab</ActionButton>
      </div>
      <div className="space-y-2">
        {slabs.map((slab: any, index: number) => (
          <div
            key={index}
            className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <FormField label="From Amount">
              <Input
                name="pharmacySlabMin"
                type="number"
                min="0"
                value={slab.min_amount ?? 0}
                onChange={(event: any) =>
                  update(index, "min_amount", event.target.value)
                }
              />
            </FormField>
            <FormField label="To Amount">
              <Input
                name="pharmacySlabMax"
                type="number"
                min="0"
                value={slab.max_amount ?? ""}
                placeholder="Above"
                onChange={(event: any) =>
                  update(index, "max_amount", event.target.value)
                }
              />
            </FormField>
            <FormField label="Discount %">
              <Input
                name="pharmacySlabDiscount"
                type="number"
                min="0"
                max="100"
                value={slab.discount_percentage ?? 0}
                onChange={(event: any) =>
                  update(index, "discount_percentage", event.target.value)
                }
              />
            </FormField>
            <div className="flex items-end">
              <ActionButton
                tone="danger"
                className="close-button"
                onClick={() => removeRow(index)}
              >
                Remove
              </ActionButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanMetric({ label, value }: any) {
  return (
    <div className="min-h-[58px] rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
      <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-950">
        {value}
      </p>
    </div>
  );
}

function PlanTableRow({
  plan,
  activeEnrollmentCount,
  busy,
  confirmDelete,
  setConfirmDelete,
  deletePlan,
  requestDeletePlan,
  startEdit,
  togglePlanActive,
  canDeletePlans,
  openDetail,
}: any) {
  return (
    <>
      <tr className="bg-white align-middle hover:bg-slate-50">
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={openDetail}
            className="text-left"
          >
            <b className="block text-sm text-slate-950">{plan.name}</b>
            <span className="text-xs font-semibold uppercase text-slate-500">
              {plan.code || "-"}
            </span>
          </button>
        </td>
        <td className="px-4 py-3 font-semibold text-slate-950">
          {money(plan.price_amount)}
        </td>
        <td className="px-4 py-3 text-slate-700">{plan.duration_days} days</td>
        <td className="px-4 py-3 text-slate-700">{plan.free_consultations}</td>
        <td className="max-w-[180px] px-4 py-3 text-slate-700">Tenant</td>
        <td className="px-4 py-3">
          <div className="flex flex-col items-start gap-1">
            <Badge
              tone={plan.is_active ? "green" : "red"}
              className="rounded-full px-2 py-1 text-xs"
            >
              {plan.is_active ? "Active" : "Paused"}
            </Badge>
            {activeEnrollmentCount > 0 && (
              <span className="text-[11px] font-semibold text-slate-500">
                {activeEnrollmentCount} enrolled
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <PlanRowActions
            plan={plan}
            activeEnrollmentCount={activeEnrollmentCount}
            busy={busy}
            openDetail={openDetail}
            startEdit={startEdit}
            togglePlanActive={togglePlanActive}
            requestDeletePlan={requestDeletePlan}
            canDeletePlans={canDeletePlans}
          />
        </td>
      </tr>
      {confirmDelete === plan.id && (
        <tr>
          <td colSpan={7} className="bg-red-50 px-4 py-3">
            <DeleteConfirm
              plan={plan}
              busy={busy}
              deletePlan={deletePlan}
              onCancel={() => setConfirmDelete("")}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function PlanMobileRow({
  plan,
  activeEnrollmentCount,
  busy,
  confirmDelete,
  setConfirmDelete,
  deletePlan,
  requestDeletePlan,
  startEdit,
  togglePlanActive,
  canDeletePlans,
  openDetail,
}: any) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={openDetail} className="min-w-0 text-left">
          <b className="block break-words text-sm text-slate-950">
            {plan.name}
          </b>
          <span className="text-xs font-semibold uppercase text-slate-500">
            {plan.code || "-"}
          </span>
        </button>
        <Badge
          tone={plan.is_active ? "green" : "red"}
          className="rounded-full px-2 py-1 text-xs"
        >
          {plan.is_active ? "Active" : "Paused"}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <PlanInlineDetail label="Price" value={money(plan.price_amount)} />
        <PlanInlineDetail label="Duration" value={`${plan.duration_days} days`} />
        <PlanInlineDetail label="Consults" value={plan.free_consultations} />
        <PlanInlineDetail label="Scope" value="Tenant" />
      </div>
      {activeEnrollmentCount > 0 && (
        <p className="mt-2 text-[11px] font-semibold text-slate-500">
          {activeEnrollmentCount} enrolled
        </p>
      )}
      <div className="mt-3">
        <PlanRowActions
          plan={plan}
          activeEnrollmentCount={activeEnrollmentCount}
          busy={busy}
          openDetail={openDetail}
          startEdit={startEdit}
          togglePlanActive={togglePlanActive}
          requestDeletePlan={requestDeletePlan}
          canDeletePlans={canDeletePlans}
        />
      </div>
      {confirmDelete === plan.id && (
        <div className="mt-3 rounded-xl bg-red-50 p-3">
          <DeleteConfirm
            plan={plan}
            busy={busy}
            deletePlan={deletePlan}
            onCancel={() => setConfirmDelete("")}
          />
        </div>
      )}
    </div>
  );
}

function PlanRowActions({
  plan,
  activeEnrollmentCount,
  busy,
  openDetail,
  startEdit,
  togglePlanActive,
  requestDeletePlan,
  canDeletePlans,
}: any) {
  return (
    <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
      <PlanIconButton title="View" onClick={openDetail}>
        View
      </PlanIconButton>
      <PlanIconButton title="Edit" onClick={() => startEdit(plan)}>
        Edit
      </PlanIconButton>
      <PlanIconButton
        title={plan.is_active ? "Pause" : "Activate"}
        disabled={busy === `toggle-${plan.id}`}
        onClick={() => togglePlanActive(plan)}
        tone={plan.is_active ? "amber" : "green"}
      >
        {plan.is_active ? "Pause" : "Activate"}
      </PlanIconButton>
      {canDeletePlans && (
        <PlanIconButton
          title="Deactivate (keeps patient records)"
          onClick={() => requestDeletePlan(plan)}
          tone="red"
        >
          Deactivate
        </PlanIconButton>
      )}
    </div>
  );
}

function PlanIconButton({
  children,
  tone = "slate",
  className = "",
  ...props
}: any) {
  const tones: any = {
    slate: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    amber: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
    green: "border-green-200 bg-green-50 text-green-800 hover:bg-green-100",
    red: "border-red-200 bg-white text-red-600 hover:bg-red-50",
  };
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${tones[tone] || tones.slate} ${className}`}
    >
      {children}
    </button>
  );
}

function DeleteConfirm({ plan, busy, deletePlan, onCancel }: any) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <span className="flex-1 text-xs font-semibold text-red-700">
        Deactivate <b>{plan.name}</b>? Existing patient records are kept and the plan
        can be reactivated later.
      </span>
      <button
        type="button"
        disabled={busy === `delete-${plan.id}`}
        onClick={() => deletePlan(plan.id)}
        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
      >
        {busy === `delete-${plan.id}` ? "Deactivating..." : "Yes, Deactivate"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
      >
        Cancel
      </button>
    </div>
  );
}

function PlanActionButton({
  children,
  tone = "slate",
  className = "",
  ...props
}: any) {
  const tones: any = {
    slate: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    amber: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
    green: "border-green-200 bg-green-50 text-green-800 hover:bg-green-100",
    red: "border-red-200 bg-white text-red-600 hover:bg-red-50",
  };
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${tones[tone] || tones.slate} ${className}`}
    >
      {children}
    </button>
  );
}

function PlanDetailPage({
  plan,
  labTests,
  medicines,
  departments,
  onBack,
  onEdit,
  onToggle,
  activeEnrollmentCount = 0,
}: any) {
  const consultDeptIds = plan.free_consultation_department_ids || [];
  const consultDeptLabel =
    consultDeptIds.length === 0
      ? "All departments"
      : consultDeptIds
          .map(
            (id: string) =>
              (departments || []).find((dept: any) => dept.id === id)?.name || id,
          )
          .join(", ");
  const benefitItemCount =
    (plan.free_lab_test_ids?.length || 0) +
    (plan.discounted_lab_test_ids?.length || 0) +
    (plan.free_medicine_ids?.length || 0) +
    (plan.discounted_medicine_ids?.length || 0);

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="mb-3 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Back to Plans
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-bold">{plan.name}</h3>
              <Badge
                tone={plan.is_active ? "green" : "red"}
                className="table-status p-2"
              >
                {plan.is_active ? "Active" : "Paused"}
              </Badge>
            </div>
            {plan.code && (
              <p className="mt-1 break-all text-sm text-slate-500">
                {plan.code}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <PlanActionButton onClick={onEdit}>Edit</PlanActionButton>
            <PlanActionButton
              onClick={onToggle}
              tone={plan.is_active ? "amber" : "green"}
            >
              {plan.is_active ? "Pause" : "Activate"}
            </PlanActionButton>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PlanMetric label="Price" value={money(plan.price_amount)} />
          <PlanMetric label="Duration" value={`${plan.duration_days} days`} />
          <PlanMetric
            label="Activation"
            value={`${plan.activation_after_days || 0} days`}
          />
          <PlanMetric label="Consults" value={plan.free_consultations} />
          <PlanMetric label="Consult Departments" value={consultDeptLabel} />
          <PlanMetric
            label="Lab Discount"
            value={`${plan.lab_discount_percentage}%`}
          />
          <PlanMetric
            label="Pharmacy"
            value={pharmacyBenefitLabel(plan)}
          />
          <PlanMetric label="Scope" value="Tenant" />
          <PlanMetric label="Benefit Items" value={`${benefitItemCount} items`} />
          <PlanMetric
            label="Min Bill"
            value={money(plan.min_discount_amount)}
          />
          <PlanMetric
            label="Enrollments"
            value={activeEnrollmentCount}
          />
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <PharmacySlabList slabs={plan.pharmacy_discount_slabs || []} />
        <BenefitList
          title="Free Lab Tests"
          ids={plan.free_lab_test_ids}
          rows={labTests}
          priceKey="default_price"
          quantities={plan.free_lab_test_quantities}
        />
        <BenefitList
          title="Discounted Lab Tests"
          ids={plan.discounted_lab_test_ids}
          rows={labTests}
          priceKey="default_price"
        />
        <BenefitList
          title="Free Medicines"
          ids={plan.free_medicine_ids}
          rows={medicines}
          priceKey="default_sale_price"
          quantities={plan.free_medicine_quantities}
        />
        <BenefitList
          title="Discounted Medicines"
          ids={plan.discounted_medicine_ids}
          rows={medicines}
          priceKey="default_sale_price"
        />
      </div>
    </div>
  );
}

function PharmacySlabList({ slabs }: any) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h4 className="card-title font-bold">Pharmacy Discount Slabs</h4>
        <Badge tone="blue" className="normal-badge">{slabs.length}</Badge>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        {slabs.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No slabs configured.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {slabs.map((slab: any, index: number) => (
              <div
                key={`${slab.min_amount}-${slab.max_amount}-${index}`}
                className="grid grid-cols-3 gap-3 px-4 py-3 text-sm"
              >
                <PlanInlineDetail
                  label="From"
                  value={money(slab.min_amount)}
                />
                <PlanInlineDetail
                  label="To"
                  value={
                    slab.max_amount === null || slab.max_amount === undefined
                      ? "Above"
                      : money(slab.max_amount)
                  }
                />
                <PlanInlineDetail
                  label="Discount"
                  value={`${slab.discount_percentage || 0}%`}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function PlanInlineDetail({ label, value }: any) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function BenefitList({ title, ids, rows, priceKey, quantities }: any) {
  const selected = (ids || []).map(
    (id: string) =>
      rows.find((row: any) => row.id === id) || { id, name: "Selected item" },
  );
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h4 className="card-title font-bold">{title}</h4>
        <Badge tone="blue" className="normal-badge">{selected.length}</Badge>
      </div>
      <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-slate-200">
        {selected.length === 0 && (
          <p className="p-4 text-sm text-slate-500">No items selected.</p>
        )}
        {selected.map((row: any) => {
          const qty = quantities ? Number(quantities[row.id]) || 1 : null;
          return (
            <div
              key={row.id}
              className="grid gap-2 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div>
                <b>{row.name}</b>
                <p className="break-all text-xs text-slate-500">
                  {row.code ||
                    row.generic_name ||
                    row.department ||
                    row.form ||
                    "-"}
                </p>
              </div>
              <span className="flex items-center justify-end gap-2 font-bold">
                {qty !== null && <Badge tone="green" className="normal-badge">Free × {qty}</Badge>}
                {row[priceKey] !== undefined ? money(row[priceKey]) : "-"}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ActiveEnrollmentsTable({
  rows,
  patientMap,
  canManage,
  busy,
  onUpdate,
  onCancel,
}: any) {
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<any | null>(null);
  const totalPages = Math.max(1, Math.ceil(rows.length / enrollmentPageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice(
    (safePage - 1) * enrollmentPageSize,
    safePage * enrollmentPageSize,
  );
  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  function startEdit(row: any) {
    setEditing({
      id: row.id,
      starts_on: String(row.starts_on || "").slice(0, 10),
      ends_on: String(row.ends_on || "").slice(0, 10),
      paid_amount: String(row.paid_amount ?? 0),
      used_consultations: String(row.used_consultations ?? 0),
    });
  }

  function editValue(key: string, value: string) {
    setEditing((current: any) => ({ ...current, [key]: value }));
  }

  function saveEdit(row: any) {
    if (!editing) return;
    onUpdate(row, {
      starts_on: editing.starts_on,
      ends_on: editing.ends_on,
      paid_amount: Number(editing.paid_amount || 0),
      used_consultations: Number(editing.used_consultations || 0),
    });
    setEditing(null);
  }

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="text-base lg:text-lg font-bold">Active Enrollments</h3>
          <p className="text-xs lg:text-sm text-slate-500">
            Paginated table for active patient memberships.
          </p>
        </div>
        <Badge
          tone="green"
          className="w-[20%] lg:w-[15%] text-xs lg:text-sm rounded-full py-2 px-2"
        >
          {rows.length} active
        </Badge>
      </div>
      <div className="mt-4 overflow-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[860px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[80px]" />
            <col className="w-[230px]" />
            <col className="w-[220px]" />
            <col className="w-[140px]" />
            <col className="w-[110px]" />
            <col className="w-[120px]" />
            <col className="w-[120px]" />
            {canManage && <col className="w-[150px]" />}
          </colgroup>
          <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">#</th>
              <th>Patient</th>
              <th>Plan</th>
              <th>Validity</th>
              <th>Benefits Used</th>
              <th className="text-left">Paid</th>
              <th>Status</th>
              {canManage && <th className="text-right pr-4">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={canManage ? 8 : 7} className="px-4 py-4 text-slate-500 text-xs lg:text-sm" >
                  No active enrollments yet.
                </td>
              </tr>
            )}
            {pageRows.map((row: any, index: number) => {
              const isEditing = editing?.id === row.id;
              return (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-4 font-semibold text-slate-500 text-xs lg:text-sm">
                    {(safePage - 1) * enrollmentPageSize + index + 1}
                  </td>
                  <td>
                    <b className="text-xs lg:text-sm">
                      {patientMap.get(row.patient_id)?.name ||
                        patientMap.get(row.patient_id)?.full_name ||
                        "Patient"}
                    </b>
                    <p className="text-xs text-slate-500 text-xs lg:text-sm">
                      {patientMap.get(row.patient_id)?.patient_number || ""}
                    </p>
                  </td>
                  <td>
                    <b className="text-xs lg:text-sm">{row.plan?.name || "Membership plan"}</b>
                    {row.plan?.code && (
                      <p className="text-xs text-slate-500">{row.plan.code}</p>
                    )}
                  </td>
                  <td className="text-xs lg:text-sm">
                    {isEditing ? (
                      <div className="grid gap-1">
                        <input
                          type="date"
                          value={editing.starts_on}
                          onChange={(event: any) => editValue("starts_on", event.target.value)}
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                        />
                        <input
                          type="date"
                          value={editing.ends_on}
                          onChange={(event: any) => editValue("ends_on", event.target.value)}
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                        />
                      </div>
                    ) : (
                      <>
                        {displayDate(row.starts_on)} to {displayDate(row.ends_on)}
                      </>
                    )}
                  </td>
                  <td className="text-left font-semibold tabular-nums text-xs lg:text-sm">
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        value={editing.used_consultations}
                        onChange={(event: any) => editValue("used_consultations", event.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs"
                      />
                    ) : (
                      <div className="space-y-1">
                        <div>
                          Consults {row.used_consultations || 0}/
                          {row.plan?.free_consultations ?? 0}
                        </div>
                        <div className="font-medium text-slate-500">
                          Lab {row.used_free_lab_count || 0} used ·{" "}
                          {row.remaining_free_lab_count || 0} left
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="text-left font-semibold tabular-nums text-xs lg:text-sm">
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        value={editing.paid_amount}
                        onChange={(event: any) => editValue("paid_amount", event.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs"
                      />
                    ) : (
                      money(row.paid_amount)
                    )}
                  </td>
                  <td>
                    <Badge
                      tone="green"
                      className="text-xs lg:text-sm rounded-full py-2 px-2"
                    >
                      {row.status}
                    </Badge>
                  </td>
                  {canManage && (
                    <td className="pr-4">
                      <div className="flex justify-end gap-2">
                        {isEditing ? (
                          <>
                            <PlanIconButton
                              title="Save"
                              disabled={busy === `enrollment-${row.id}`}
                              onClick={() => saveEdit(row)}
                              tone="green"
                            >
                              Save
                            </PlanIconButton>
                            <PlanIconButton
                              title="Cancel"
                              onClick={() => setEditing(null)}
                            >
                              Cancel
                            </PlanIconButton>
                          </>
                        ) : (
                          <>
                            <PlanIconButton title="Edit enrollment" onClick={() => startEdit(row)}>
                              Edit
                            </PlanIconButton>
                            <PlanIconButton
                              title="Cancel enrollment"
                              disabled={busy === `enrollment-${row.id}`}
                              onClick={() => onCancel(row)}
                              tone="amber"
                            >
                              Cancel
                            </PlanIconButton>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={rows.length}
        pageSize={enrollmentPageSize}
        onPage={setPage}
      />
    </Card>
  );
}

function Pagination({ page, totalPages, total, pageSize, onPage }: any) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="mt-4 flex flex-col justify-between gap-3 text-sm text-slate-500 sm:flex-row sm:items-center">
      <span>
        Showing {start}-{end} of {total}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300"
        >
          Previous
        </button>
        <span className="rounded-xl bg-slate-50 px-3 py-2 font-bold text-slate-700">
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300"
        >
          Next
        </button>
      </div>
    </div>
  );
}
