import { displayDate } from "@/utils/helper";
import { invoicePatientDueAmount, isMembershipPlanInvoice } from "@/features/billing/helpers";

export function toRow(patient: any) {
  return { ...patient, active_alert_count: 0, critical_alert_count: 0 };
}

export function patientDateInputValue(value: any) {
  const text = String(value || "").trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);

  return match?.[1] || "";
}

export function calculateAgeYears(dateOfBirth: string) {
  if (!dateOfBirth) return "";

  const dob = new Date(`${dateOfBirth}T00:00:00`);

  if (Number.isNaN(dob.getTime())) return "";

  const today = new Date();

  let age = today.getFullYear() - dob.getFullYear();

  const monthDelta = today.getMonth() - dob.getMonth();

  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }

  return age >= 0 && age <= 100 ? String(age) : "";
}

export function calculateDobFromAge(age: string | number) {
  const numericAge = Number(age);

  if (Number.isNaN(numericAge) || numericAge < 0 || numericAge > 100) {
    return "";
  }

  const today = new Date();

  const dob = new Date(
    today.getFullYear() - numericAge,
    today.getMonth(),
    today.getDate(),
  );

  return dob.toISOString().split("T")[0];
}

export function displayPatientGender(value: any) {
  const text = String(value || "").trim();
  if (!text) return "-";
  return text
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function isActivePatientRecord(patient: any) {
  const status = String(patient?.status || "active")
    .trim()
    .toLowerCase();
  return !["inactive", "deceased", "disabled", "archived"].includes(status);
}

export function patientDisplayName(patient: any) {
  return (
    patient?.full_name || patient?.name || patient?.patient_name || "Patient"
  );
}

export function patientDisplayNumber(patient: any) {
  return patient?.patient_number || patient?.patientNumber || patient?.id || "";
}

/**
 * The one number to show for a patient: primary, else alternate. Family/
 * guardian membership sharing is handled through explicit patient family
 * relationships, not guardian phone fields.
 */
export function patientDisplayMobile(patient: any) {
  return (
    patient?.mobile ||
    patient?.alternate_mobile ||
    ""
  );
}

export function patientPickerLabel(patient: any) {
  return [
    patientDisplayName(patient),
    patientDisplayNumber(patient),
    patientDisplayMobile(patient),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function patientSearchText(patient: any, branch?: any) {
  return [
    patient.id,
    patient.patient_number,
    patient.full_name,
    patient.name,
    patient.mobile,
    patient.alternate_mobile,
    patient.email,
    patient.area,
    patient.address,
    patient.status,
    branch?.name,
    branch?.code,
    branch?.area,
    branch?.city,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function fmtDate(val: string | null | undefined) {
  return displayDate(val);
}

export function splitListText(value: any) {
  const seen = new Set<string>();
  return String(value || "")
    .split(/\n|,/)
    .map((item: string) => item.trim())
    .filter((item: string) => {
      if (!item) return false;
      const key = item.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function uniqueClinicalRecords(
  rows: any[],
  getKey: (row: any) => string,
) {
  const seen = new Set<string>();
  return rows.filter((row: any) => {
    const key = getKey(row).toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeClinicalText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function clinicalRecordsWithUniqueItems(
  rows: any[],
  getValue: (row: any) => any,
) {
  return rows
    .map((row: any) => {
      // De-dupe items within this one row's own list only (e.g. a test
      // listed twice on the same order) — the `seen` set must reset per
      // row, or a repeat test name on a later order (e.g. another CBC)
      // gets filtered out as "already seen" and can silently drop that
      // entire order once its items list becomes empty.
      const seen = new Set<string>();
      const items = splitListText(getValue(row)).filter((item: string) => {
        const key = normalizeClinicalText(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { row, items };
    })
    .filter(({ items }: any) => items.length > 0);
}

/**
 * Lab & service orders (lab + home care, merged and date-sorted) and
 * dispensed-medicine rows for a patient — shared by the patient detail
 * "Lab & Services"/"Medicines" tabs and the Patient History single-page view
 * so both read the same de-duplication/grouping logic.
 */
export function deriveClinicalRows({
  labOrders = [],
  homeCareBookings = [],
  pharmacyIssues = [],
}: {
  labOrders?: any[];
  homeCareBookings?: any[];
  pharmacyIssues?: any[];
}) {
  // Keyed by id first: two orders can legitimately share the same date,
  // status, and test/medicine text (e.g. a routine CBC ordered both during
  // a consultation and again as a separate OP-direct walk-in the same day)
  // — including `id` stops those distinct records from being collapsed
  // into one and silently dropped, while same-id rows (true duplicates,
  // e.g. from a join fan-out) still dedupe correctly.
  const uniqueLabOrders = uniqueClinicalRecords(
    labOrders,
    (order: any) =>
      `${order.id || ""}|${fmtDate(order.created_at)}|${order.status || ""}|${order.tests || ""}|${order.notes || ""}`,
  );
  const uniquePharmacyIssues = uniqueClinicalRecords(
    pharmacyIssues,
    (issue: any) =>
      `${issue.id || ""}|${fmtDate(issue.created_at)}|${issue.status || ""}|${issue.medicine_text || ""}|${issue.notes || ""}|${issue.amount || ""}`,
  );
  const bundleDate = (bundle: any) =>
    new Date(
      bundle.row.created_at ||
        bundle.row.start_date ||
        bundle.row.visit_date ||
        0,
    ).getTime();
  const byRecency = (a: any, b: any) => bundleDate(b) - bundleDate(a);

  const labRows = clinicalRecordsWithUniqueItems(
    uniqueLabOrders,
    (order: any) => order.tests,
  )
    .map((bundle: any) => ({ ...bundle, source: "lab" }))
    .sort(byRecency);
  const homeCareRows = homeCareBookings
    .map((booking: any) => {
      const serviceItems =
        (booking.services || []).length > 0
          ? booking.services
          : booking.visit_logs || [];
      const items = serviceItems
        .map((item: any) => item.description || item.service_category)
        .filter(Boolean);
      return { row: booking, items, source: "home_care" };
    })
    .sort(byRecency);
  const labServiceRows = [...labRows, ...homeCareRows].sort(byRecency);
  const medicineRows = clinicalRecordsWithUniqueItems(
    uniquePharmacyIssues,
    (issue: any) => issue.medicine_text,
  );

  return { labServiceRows, labRows, homeCareRows, medicineRows };
}

/**
 * Membership enrollment resolution (which plan is active/pending/queued,
 * free-benefit usage) and invoice totals for a patient — shared by the
 * patient detail Membership tab and the Patient History overview dashboard
 * so both read the same "which enrollment counts as active" logic.
 */
export function derivePatientBillingMembership({
  membershipEnrollments = [],
  membershipPlans = [],
  patientInvoices = [],
}: {
  membershipEnrollments?: any[];
  membershipPlans?: any[];
  patientInvoices?: any[];
}) {
  const membershipInvoices = patientInvoices.filter(isMembershipPlanInvoice);
  const purchaseInvoiceFor = (enrollment: any) =>
    membershipInvoices.find(
      (invoice: any) => invoice.id === enrollment.purchase_invoice_id,
    ) ||
    membershipInvoices.find(
      (invoice: any) =>
        invoice.patient_subscription_enrollment_id === enrollment.id,
    );
  const isEnrollmentPaid = (enrollment: any) => {
    const invoice = purchaseInvoiceFor(enrollment);
    if (invoice) return Number(invoice.balance_amount || 0) <= 0;
    return (
      Number(enrollment.paid_amount || 0) >=
      Number(enrollment.plan?.price_amount || 0)
    );
  };
  const resolvedMembershipEnrollments = membershipEnrollments.map(
    (enrollment: any) => ({
      ...enrollment,
      plan:
        membershipPlans.find((plan: any) => plan.id === enrollment.plan_id) ||
        enrollment.plan ||
        null,
    }),
  );
  const activeMembership = resolvedMembershipEnrollments.find(
    (row: any) => row.status === "active" && isEnrollmentPaid(row),
  );
  const pendingMembership = resolvedMembershipEnrollments.find(
    (row: any) => row.status === "active" && !isEnrollmentPaid(row),
  );
  const queuedMembership = resolvedMembershipEnrollments.find(
    (row: any) => row.status === "queued",
  );
  const visibleMembership = activeMembership || pendingMembership;
  const freeConsultationsAllocated = Number(
    visibleMembership?.allocated_free_consultations ??
      visibleMembership?.plan?.free_consultations ??
      0,
  );
  const freeConsultationsUsed = Number(
    visibleMembership?.used_consultations || 0,
  );
  const freeLabUsed = Number(visibleMembership?.used_free_lab_count || 0);
  const freeLabRemaining = Number(
    visibleMembership?.remaining_free_lab_count || 0,
  );
  const freeLabAllocated = freeLabUsed + freeLabRemaining;
  const freeMedicineUsed = Number(
    visibleMembership?.used_free_medicine_count || 0,
  );
  const freeMedicineRemaining = Number(
    visibleMembership?.remaining_free_medicine_count || 0,
  );
  const freeMedicineAllocated = freeMedicineUsed + freeMedicineRemaining;
  const membershipUsageInvoices = patientInvoices.filter(
    (invoice: any) =>
      Number(invoice.membership_discount_amount || 0) > 0 &&
      !["cancelled", "refunded"].includes(
        String(invoice.status || "").toLowerCase(),
      ),
  );
  const membershipSavings = membershipUsageInvoices.reduce(
    (sum: number, invoice: any) =>
      sum + Number(invoice.membership_discount_amount || 0),
    0,
  );
  const totalBilled = patientInvoices.reduce(
    (sum: number, invoice: any) =>
      sum +
      (["cancelled", "refunded"].includes(String(invoice.status).toLowerCase())
        ? 0
        : Number(invoice.total_amount || 0)),
    0,
  );
  const totalPaid = patientInvoices.reduce(
    (sum: number, invoice: any) => sum + Number(invoice.paid_amount || 0),
    0,
  );
  const totalDue = patientInvoices.reduce(
    (sum: number, invoice: any) => sum + invoicePatientDueAmount(invoice),
    0,
  );

  return {
    membershipInvoices,
    purchaseInvoiceFor,
    isEnrollmentPaid,
    resolvedMembershipEnrollments,
    activeMembership,
    pendingMembership,
    queuedMembership,
    visibleMembership,
    freeConsultationsAllocated,
    freeConsultationsUsed,
    freeLabUsed,
    freeLabAllocated,
    freeMedicineUsed,
    freeMedicineAllocated,
    membershipUsageInvoices,
    membershipSavings,
    totalBilled,
    totalPaid,
    totalDue,
  };
}

export type BranchOption = {
  id: string;
  name: string;
};

export type PatientFormPayload = {
  branchId: string;
  fullName: string;
  mobile: string;
  alternateMobile: string;
  guardianName: string;
  guardianMobile: string;
  email: string;
  gender: string;
  dateOfBirth: string;
  ageYears: string;
  area: string;
  address: string;
  bloodGroup: string;
  status: string;
};

export function formValue(fd: FormData, key: string) {
  return String(fd.get(key) || "").trim();
}

export function patientFormPayload(fd: FormData): PatientFormPayload {
  return {
    branchId: formValue(fd, "branchId"),
    fullName: formValue(fd, "fullName"),
    mobile: formValue(fd, "mobile"),
    alternateMobile: formValue(fd, "alternateMobile"),
    guardianName: formValue(fd, "guardianName"),
    guardianMobile: formValue(fd, "guardianMobile"),
    email: formValue(fd, "email"),
    gender: formValue(fd, "gender") || "unknown",
    dateOfBirth: formValue(fd, "dateOfBirth"),
    ageYears: formValue(fd, "ageYears"),
    area: formValue(fd, "area"),
    address: formValue(fd, "address"),
    bloodGroup: formValue(fd, "bloodGroup"),
    status: formValue(fd, "status") || "active",
  };
}

export function patientField(
  patient: any,
  snakeKey: string,
  camelKey?: string,
) {
  return patient?.[snakeKey] ?? patient?.[camelKey || snakeKey] ?? "";
}

export function todayInputValue() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

export function codeFromName(prefix: string, name: string) {
  const clean =
    String(name || "ITEM")
      .replace(/[^a-z0-9]/gi, "")
      .toUpperCase()
      .slice(0, 18) || "ITEM";
  return `${prefix}${clean}${Date.now().toString().slice(-4)}`.slice(0, 40);
}
export function sameName(row: any, name: string) {
  return (
    String(row?.name || "")
      .trim()
      .toLowerCase() ===
    String(name || "")
      .trim()
      .toLowerCase()
  );
}
export function benefitLabel(value: any, rows: any[]) {
  const row = rows.find((item: any) => item.id === value);
  return row?.name || value;
}
// Re-key a quantity map from picker selection values onto resolved backend ids.
// resolveLabBenefitIds/resolveMedicineBenefitIds preserve order, so zip by index.
export function mapQuantitiesToIds(
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

export function normalizePharmacySlabs(slabs: any[]) {
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
  return rows.length
    ? rows
    : [{ min_amount: 0, max_amount: null, discount_percentage: 0 }];
}

export function parsePharmacySlabs(fd: FormData) {
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

export function pharmacyBenefitLabel(plan: any) {
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

export function canDeleteMembershipPlans(user: any) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return (
    Boolean(user?.is_super_admin) ||
    user?.user_type === "tenant_admin" ||
    roles.includes("tenant_admin")
  );
}
