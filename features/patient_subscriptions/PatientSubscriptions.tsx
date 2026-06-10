"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionButton,
  Badge,
  Button,
  Card,
  Input,
  Select,
  StatusToast,
} from "@/components/common/ui";
import { FormField } from "@/components/FormElements";
import { apiFetch } from "@/lib/api";
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
  const [view, setView] = useState("list");
  const [toast, setToast] = useState<{
    text: string;
    kind: "success" | "error" | "warn";
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedPatient, setSelectedPatient] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [freeLabTestIds, setFreeLabTestIds] = useState<string[]>([]);
  const [discountedLabTestIds, setDiscountedLabTestIds] = useState<string[]>(
    [],
  );
  const [freeMedicineIds, setFreeMedicineIds] = useState<string[]>([]);
  const [discountedMedicineIds, setDiscountedMedicineIds] = useState<string[]>(
    [],
  );
  const [editingPlan, setEditingPlan] = useState<any | null>(null);
  const [editFreeLabIds, setEditFreeLabIds] = useState<string[]>([]);
  const [editDiscountedLabIds, setEditDiscountedLabIds] = useState<string[]>(
    [],
  );
  const [editFreeMedIds, setEditFreeMedIds] = useState<string[]>([]);
  const [editDiscountedMedIds, setEditDiscountedMedIds] = useState<string[]>(
    [],
  );
  const [confirmDelete, setConfirmDelete] = useState("");
  const [detailPlanId, setDetailPlanId] = useState("");
  const [createBranchIds, setCreateBranchIds] = useState<string[]>(
    branchId ? [branchId] : [""],
  );
  const patientMap = useMemo<Map<string, any>>(
    () => new Map((patients || []).map((p: any) => [p.id, p])),
    [patients],
  );
  const branchRows = (branches?.length ? branches : clinic?.branches) || [];
  const branchMap = useMemo<Map<string, any>>(
    () => new Map((branchRows || []).map((branch: any) => [branch.id, branch])),
    [branchRows],
  );
  const branchName = (id: any) =>
    id ? branchMap.get(id)?.name || "Assigned branch" : "All branches";

  async function load() {
    if (!apiSession) return;
    setLoadError("");
    try {
      const [planRows, enrollmentRows, testRows, medicineRows] =
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
        ]);
      setPlans(planRows);
      setEnrollments(enrollmentRows);
      setLabTests(testRows);
      setMedicines(medicineRows);
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
      const selectedBranches = createBranchIds.length
        ? createBranchIds
        : [branchId || ""];
      const basePayload = {
        name: fd.get("name"),
        code: fd.get("code") || null,
        price_amount: Number(fd.get("priceAmount") || 0),
        duration_days: Number(fd.get("durationDays") || 30),
        free_consultations: Number(fd.get("freeConsultations") || 0),
        lab_discount_percentage: Number(fd.get("labDiscount") || 0),
        pharmacy_discount_percentage: Number(fd.get("pharmacyDiscount") || 0),
        min_discount_amount: Number(fd.get("minDiscountAmount") || 0),
        created_by_user_id: apiSession.user?.id,
      };
      for (const selectedBranch of selectedBranches) {
        const branchValue = String(selectedBranch || "");
        const freeLabIds = await resolveLabBenefitIds(
          freeLabTestIds,
          branchValue,
        );
        const discountedLabIds = await resolveLabBenefitIds(
          discountedLabTestIds,
          branchValue,
        );
        const freeMedIds = await resolveMedicineBenefitIds(
          freeMedicineIds,
          branchValue,
        );
        const discountedMedIds = await resolveMedicineBenefitIds(
          discountedMedicineIds,
          branchValue,
        );
        await apiFetch("/patient-subscriptions/plans", apiSession, {
          method: "POST",
          body: JSON.stringify({
            ...basePayload,
            branch_id: branchValue || null,
            free_lab_test_ids: freeLabIds,
            discounted_lab_test_ids: discountedLabIds,
            free_medicine_ids: freeMedIds,
            discounted_medicine_ids: discountedMedIds,
          }),
        });
      }
      form.reset();
      setCreateBranchIds(branchId ? [branchId] : [""]);
      setFreeLabTestIds([]);
      setDiscountedLabTestIds([]);
      setFreeMedicineIds([]);
      setDiscountedMedicineIds([]);
      setView("list");
      await load();
      setToast({
        text:
          selectedBranches.length > 1
            ? "Patient subscription plans created for selected branches."
            : "Patient subscription plan created.",
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
    setEditFreeLabIds(plan.free_lab_test_ids || []);
    setEditDiscountedLabIds(plan.discounted_lab_test_ids || []);
    setEditFreeMedIds(plan.free_medicine_ids || []);
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
            branch_id: fd.get("branchId") || null,
            name: fd.get("name"),
            code: fd.get("code") || null,
            price_amount: Number(fd.get("priceAmount") || 0),
            duration_days: Number(fd.get("durationDays") || 30),
            free_consultations: Number(fd.get("freeConsultations") || 0),
            lab_discount_percentage: Number(fd.get("labDiscount") || 0),
            pharmacy_discount_percentage: Number(
              fd.get("pharmacyDiscount") || 0,
            ),
            min_discount_amount: Number(fd.get("minDiscountAmount") || 0),
            free_lab_test_ids: editFreeLabIds,
            discounted_lab_test_ids: editDiscountedLabIds,
            free_medicine_ids: editFreeMedIds,
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
      setToast({ text: "Plan deleted.", kind: "success" });
    } catch (err: any) {
      setToast({
        text: err.message || "Could not delete plan.",
        kind: "error",
      });
      setConfirmDelete("");
    } finally {
      setBusy("");
    }
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
  const detailPlan = detailPlanId
    ? plans.find((plan: any) => plan.id === detailPlanId)
    : null;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <h3 className="text-lg lg:text-xl font-bold">
              Patient Subscriptions
            </h3>
            <p className="text-sm text-slate-500">
              Create clinic membership plans with free consultations, lab
              benefits, and pharmacy benefits.
            </p>
          </div>
          <Badge
            tone="green"
            className="w-[20%] lg:w-[15%] rounded-lg py-2 px-2"
          >
            Tenant module
          </Badge>
        </div>
      </Card>
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
          branchName={branchName}
          onBack={() => {
            setDetailPlanId("");
            setView("list");
          }}
          onEdit={() => startEdit(detailPlan)}
          onToggle={() => togglePlanActive(detailPlan)}
        />
      )}
      {view === "create" && (
        <PlanForm
          title="Create Plan"
          apiSession={apiSession}
          branches={branchRows}
          selectedBranches={createBranchIds}
          setSelectedBranches={setCreateBranchIds}
          busy={busy === "plan"}
          submitLabel="Create Plan"
          onSubmit={createPlan}
          back={() => setView("list")}
          labTests={labTests}
          medicines={medicines}
          freeLabTestIds={freeLabTestIds}
          setFreeLabTestIds={setFreeLabTestIds}
          discountedLabTestIds={discountedLabTestIds}
          setDiscountedLabTestIds={setDiscountedLabTestIds}
          freeMedicineIds={freeMedicineIds}
          setFreeMedicineIds={setFreeMedicineIds}
          discountedMedicineIds={discountedMedicineIds}
          setDiscountedMedicineIds={setDiscountedMedicineIds}
        />
      )}
      {view === "edit" && editingPlan && (
        <PlanForm
          title="Edit Plan"
          apiSession={apiSession}
          plan={editingPlan}
          branches={branchRows}
          busy={busy === "edit"}
          submitLabel="Save Changes"
          onSubmit={updatePlan}
          back={cancelEdit}
          labTests={labTests}
          medicines={medicines}
          freeLabTestIds={editFreeLabIds}
          setFreeLabTestIds={setEditFreeLabIds}
          discountedLabTestIds={editDiscountedLabIds}
          setDiscountedLabTestIds={setEditDiscountedLabIds}
          freeMedicineIds={editFreeMedIds}
          setFreeMedicineIds={setEditFreeMedIds}
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
                  <Select
                    value={selectedPatient}
                    onChange={(e: any) => setSelectedPatient(e.target.value)}
                  >
                    {(patients || []).map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name || p.full_name}
                      </option>
                    ))}
                  </Select>
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
              <Button
                type="button"
                onClick={() => setView("create")}
                className="w-[20%] lg:[w-10%] rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
              >
                Create Plan
              </Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {plans.length === 0 && (
                <p className="text-sm text-slate-500 md:col-span-2 xl:col-span-3">
                  No patient plans yet.
                </p>
              )}
              {plans.map((plan: any) => (
                <div
                  key={plan.id}
                  className={`rounded-2xl border p-4 text-sm transition ${editingPlan?.id === plan.id ? "border-slate-900 bg-slate-50" : ""}`}
                >
                  <div className="grid gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <b className="block break-words text-base">
                          {plan.name}
                        </b>
                        {plan.code && (
                          <p className="break-all text-xs text-slate-500">
                            {plan.code}
                          </p>
                        )}
                      </div>
                      <Badge
                        tone={plan.is_active ? "green" : "red"}
                        className="text-xs lg:text-sm rounded-full py-2 px-2"
                      >
                        {plan.is_active ? "Active" : "Paused"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <PlanMetric
                        label="Price"
                        value={money(plan.price_amount)}
                      />
                      <PlanMetric
                        label="Duration"
                        value={`${plan.duration_days} days`}
                      />
                      <PlanMetric
                        label="Branch"
                        value={branchName(plan.branch_id)}
                      />
                      <PlanMetric
                        label="Consults"
                        value={plan.free_consultations}
                      />
                      <PlanMetric
                        label="Lab"
                        value={`${plan.lab_discount_percentage}%`}
                      />
                      <PlanMetric
                        label="Pharmacy"
                        value={`${plan.pharmacy_discount_percentage}%`}
                      />
                      <PlanMetric
                        label="Benefits"
                        value={`${(plan.free_lab_test_ids?.length || 0) + (plan.discounted_lab_test_ids?.length || 0) + (plan.free_medicine_ids?.length || 0) + (plan.discounted_medicine_ids?.length || 0)} items`}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ActionButton
                        onClick={() => {
                          setDetailPlanId(plan.id);
                          setView("detail");
                        }}
                      >
                        View
                      </ActionButton>
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => startEdit(plan)}
                        className="rounded-lg px-2 py-2 text-xs lg:text-sm border border-slate-200  font-bold text-slate-600 hover:bg-white"
                      >
                        ✏ Edit
                      </button>
                      <button
                        type="button"
                        title={plan.is_active ? "Pause" : "Activate"}
                        disabled={busy === `toggle-${plan.id}`}
                        onClick={() => togglePlanActive(plan)}
                        className={`rounded-lg px-2 py-2 text-xs lg:text-sm border font-bold ${plan.is_active ? "border-amber-200 text-amber-700 hover:bg-amber-50" : "border-green-200 text-green-700 hover:bg-green-50"}`}
                      >
                        {busy === `toggle-${plan.id}`
                          ? "..."
                          : plan.is_active
                            ? "⏸ Pause"
                            : "▶ Activate"}
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => setConfirmDelete(plan.id)}
                        className="rounded-lg px-2 py-2 text-xs lg:text-sm border border-red-200 px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                  {confirmDelete === plan.id && (
                    <div className="mt-3 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3">
                      <span className="flex-1 text-xs font-semibold text-red-700">
                        Delete <b>{plan.name}</b>? This cannot be undone.
                      </span>
                      <button
                        type="button"
                        disabled={busy === `delete-${plan.id}`}
                        onClick={() => deletePlan(plan.id)}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                      >
                        {busy === `delete-${plan.id}`
                          ? "Deleting..."
                          : "Yes, Delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete("")}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-white"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
          <ActiveEnrollmentsTable
            rows={activeEnrollments}
            patientMap={patientMap}
            branchName={branchName}
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
          {selected.map((value: string) => (
            <button
              key={value}
              type="button"
              onClick={() => remove(value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
            >
              {value.startsWith("new:")
                ? value.slice(4)
                : benefitLabel(value, rows)}{" "}
              ×
            </button>
          ))}
        </div>
      )}
      {query && (
        <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
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
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50"
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
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50"
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
              className="mt-2 w-full rounded-xl bg-slate-900 px-3 py-2 text-left text-sm font-bold text-white"
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
  branches,
  selectedBranches,
  setSelectedBranches,
  busy,
  submitLabel,
  onSubmit,
  back,
  labTests,
  medicines,
  freeLabTestIds,
  setFreeLabTestIds,
  discountedLabTestIds,
  setDiscountedLabTestIds,
  freeMedicineIds,
  setFreeMedicineIds,
  discountedMedicineIds,
  setDiscountedMedicineIds,
  apiSession,
}: any) {
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="text-sm text-slate-500">
            {plan
              ? "Update this membership plan."
              : "Choose one or more branches for this membership plan."}
          </p>
        </div>
        <button
          type="button"
          onClick={back}
          className="rounded-2xl border px-4 py-3 text-sm font-bold"
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
            placeholder="Silver 199"
            required
          />
        </FormField>
        <FormField label="Code">
          <Input
            name="code"
            defaultValue={plan?.code || ""}
            placeholder="SILVER199"
          />
        </FormField>
        <FormField label="Price">
          <Input
            name="priceAmount"
            type="number"
            min="0"
            defaultValue={plan?.price_amount ?? 199}
          />
        </FormField>
        <FormField label="Duration Days">
          <Input
            name="durationDays"
            type="number"
            min="1"
            defaultValue={plan?.duration_days ?? 30}
          />
        </FormField>
        <FormField label="Free Consultations">
          <Input
            name="freeConsultations"
            type="number"
            min="0"
            defaultValue={plan?.free_consultations ?? 1}
          />
        </FormField>
        <FormField label="Lab Discount %">
          <Input
            name="labDiscount"
            type="number"
            min="0"
            max="100"
            defaultValue={plan?.lab_discount_percentage ?? 5}
          />
        </FormField>
        <FormField label="Pharmacy Discount %">
          <Input
            name="pharmacyDiscount"
            type="number"
            min="0"
            max="100"
            defaultValue={plan?.pharmacy_discount_percentage ?? 5}
          />
        </FormField>
        <FormField label="Min Bill for % Discount (₹)">
          <Input
            name="minDiscountAmount"
            type="number"
            min="0"
            defaultValue={plan?.min_discount_amount ?? 500}
            placeholder="0 = no minimum"
          />
        </FormField>
        {plan ? (
          <FormField label="Branch">
            <Select name="branchId" defaultValue={plan.branch_id || ""}>
              <option value="">All branches</option>
              {branches.map((branch: any) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </FormField>
        ) : (
          <div className="md:col-span-2 xl:col-span-4">
            <BranchPicker
              branches={branches}
              selected={selectedBranches}
              onChange={setSelectedBranches}
            />
          </div>
        )}
        <div className="md:col-span-2">
          <BenefitPicker
            label="Free Lab Tests"
            kind="lab test"
            rows={labTests}
            selected={freeLabTestIds}
            onChange={setFreeLabTestIds}
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
            className="rounded-2xl border px-4 py-3 text-sm font-bold"
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}

function BranchPicker({ branches, selected, onChange }: any) {
  const selectedSet = new Set(selected || []);
  function toggle(value: string, checked: boolean) {
    if (value === "" && checked) {
      onChange([""]);
      return;
    }
    const next = new Set(
      Array.from(selectedSet).filter((item: any) => item !== ""),
    );
    if (checked) next.add(value);
    else next.delete(value);
    onChange(Array.from(next).length ? Array.from(next) : [""]);
  }
  return (
    <div>
      <p className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
        Branches
      </p>
      <div className="grid gap-2 rounded-2xl border border-slate-200 p-3 md:grid-cols-2 xl:grid-cols-3">
        <label
          className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${selectedSet.has("") ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-700"}`}
        >
          <input
            type="checkbox"
            checked={selectedSet.has("")}
            onChange={(e: any) => toggle("", e.target.checked)}
          />
          All branches
        </label>
        {branches.map((branch: any) => (
          <label
            key={branch.id}
            className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${selectedSet.has(branch.id) ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-700"}`}
          >
            <input
              type="checkbox"
              checked={selectedSet.has(branch.id)}
              onChange={(e: any) => toggle(branch.id, e.target.checked)}
            />
            {branch.name}
          </label>
        ))}
      </div>
    </div>
  );
}

function PlanMetric({ label, value }: any) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[11px] font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function PlanDetailPage({
  plan,
  labTests,
  medicines,
  branchName,
  onBack,
  onEdit,
  onToggle,
}: any) {
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="mb-3 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Back to Plans
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-bold">{plan.name}</h3>
              <Badge
                tone={plan.is_active ? "green" : "red"}
                className="text-xs lg:text-sm rounded-full py-2 px-2"
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
            <ActionButton onClick={onEdit}>Edit</ActionButton>
            <ActionButton onClick={onToggle}>
              {plan.is_active ? "Pause" : "Activate"}
            </ActionButton>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <PlanMetric label="Price" value={money(plan.price_amount)} />
          <PlanMetric label="Duration" value={`${plan.duration_days} days`} />
          <PlanMetric label="Consults" value={plan.free_consultations} />
          <PlanMetric
            label="Lab Discount"
            value={`${plan.lab_discount_percentage}%`}
          />
          <PlanMetric
            label="Pharmacy"
            value={`${plan.pharmacy_discount_percentage}%`}
          />
          <PlanMetric label="Branch" value={branchName(plan.branch_id)} />
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <BenefitList
          title="Free Lab Tests"
          ids={plan.free_lab_test_ids}
          rows={labTests}
          priceKey="default_price"
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

function BenefitList({ title, ids, rows, priceKey }: any) {
  const selected = (ids || []).map(
    (id: string) =>
      rows.find((row: any) => row.id === id) || { id, name: "Selected item" },
  );
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-bold">{title}</h4>
        <Badge tone="blue">{selected.length}</Badge>
      </div>
      <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-slate-200">
        {selected.length === 0 && (
          <p className="p-4 text-sm text-slate-500">No items selected.</p>
        )}
        {selected.map((row: any) => (
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
            <span className="font-bold">
              {row[priceKey] !== undefined ? money(row[priceKey]) : "-"}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ActiveEnrollmentsTable({ rows, patientMap, branchName }: any) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / enrollmentPageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice(
    (safePage - 1) * enrollmentPageSize,
    safePage * enrollmentPageSize,
  );
  useEffect(() => {
    setPage(1);
  }, [rows.length]);
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
        <table className="w-full min-w-[980px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[80px]" />
            <col className="w-[230px]" />
            <col className="w-[220px]" />
            <col className="w-[180px]" />
            <col className="w-[140px]" />
            <col className="w-[120px]" />
            <col className="w-[120px]" />
          </colgroup>
          <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">#</th>
              <th>Patient</th>
              <th>Plan</th>
              <th>Branch</th>
              <th>Validity</th>
              <th className="text-left">Paid</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-slate-500 text-xs lg:text-sm" >
                  No active enrollments yet.
                </td>
              </tr>
            )}
            {pageRows.map((row: any, index: number) => (
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
                <td className="text-xs lg:text-sm">{branchName(row.branch_id)}</td>
                <td className="text-xs lg:text-sm">
                  {displayDate(row.starts_on)} to {displayDate(row.ends_on)}
                </td>
                <td className="text-left font-semibold tabular-nums text-xs lg:text-sm">
                  {money(row.paid_amount)}
                </td>
                <td>
                  <Badge
                    tone="green"
                    className="text-xs lg:text-sm rounded-full py-2 px-2"
                  >
                    {row.status}
                  </Badge>
                </td>
              </tr>
            ))}
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
