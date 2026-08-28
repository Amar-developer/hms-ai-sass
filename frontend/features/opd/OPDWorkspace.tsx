"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Clock3,
  ClipboardList,
  FlaskConical,
  LayoutTemplate,
  Pill,
  ReceiptText,
  Stethoscope,
  CreditCard,
  PlusCircle,
} from "lucide-react";

import { AppointmentCalendarBooking } from "@/features/appointments/AppointmentCalendarBooking";
import { SearchableSelect } from "@/app/components/common/ui";
import type { Props as AppointmentWorkspaceProps } from "@/features/appointments/types";
import { DoctorConsultation } from "@/features/consulation/DoctorConsultation";
import { uniqueDepartmentRows } from "@/lib/options";
import { opdAppointmentPath } from "./routing";
import { OPDInvoiceQueue } from "./components/OPDInvoiceQueue";
import { OPDPaymentQueue } from "./components/OPDPaymentQueue";
import { ClinicalTemplateManager } from "./components/ClinicalTemplateManager";
import { Lab } from "@/features/lab/Lab";
import { Pharmacy } from "@/features/pharmacy/Pharmacy";
import {
  fetchOPDBillingQueueRows,
  fetchOPDPaymentQueueRows,
} from "./opdBillingQueue";
import {
  listConsultationReferrals,
  listOrders,
} from "@/features/lab/api/lab.api";
import { fetchPharmacyIssues } from "@/features/pharmacy/api/pharmacy.api";

export type OPDSection =
  | "consultation"
  | "lab-services"
  | "prescriptions"
  | "invoices"
  | "payments"
  | "templates"
  | "appointments"
  | "schedule"
  | "new";

type OPDWorkspaceProps = AppointmentWorkspaceProps &
  Record<string, any> & {
    section?: OPDSection;
    appointmentId?: string;
    setActive?: (page: string) => void;
  };

const sectionTabs = [
  {
    id: "appointments",
    label: "Appointments",
    icon: CalendarDays,
    path: "/opd/appointments",
    permissions: ["appointments.read", "appointments.manage", "appointments.create"],
  },
  {
    id: "schedule",
    label: "Doctor Schedule",
    icon: Clock3,
    path: "/opd/schedule",
    permissions: ["scheduling.read", "scheduling.manage", "consultations.read"],
  },
  {
    id: "consultation",
    label: "Consultation",
    icon: Stethoscope,
    path: "/opd/consultation",
    permissions: [
      "consultations.read",
      "consultations.write",
      "consultations.sign",
    ],
  },
  {
    id: "lab-services",
    label: "Lab & Services",
    icon: FlaskConical,
    path: "/opd/lab-services",
    permissions: ["lab.read", "lab.create", "lab.edit", "lab.manage"],
  },
  {
    id: "prescriptions",
    label: "Prescriptions",
    icon: Pill,
    path: "/opd/prescriptions",
    permissions: ["pharmacy.read", "pharmacy.create", "pharmacy.edit", "pharmacy.manage"],
  },
  {
    id: "invoices",
    label: "Billing",
    icon: ReceiptText,
    path: "/opd/billing",
    permissions: ["billing.manage", "billing.create", "invoices.create"],
  },
  {
    id: "payments",
    label: "Payments",
    icon: CreditCard,
    path: "/opd/payments",
    permissions: [
      "billing.manage",
      "payments.manage",
      "payments.create",
    ],
  },
  {
    id: "templates",
    label: "Templates",
    icon: LayoutTemplate,
    path: "/opd/templates",
    permissions: [
      "consultations.read",
      "consultations.write",
      "consultations.sign",
    ],
  },
] as const;

function normalizedStatus(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function readDismissedConsultationIds(storageKey: string) {
  if (typeof window === "undefined") return [];
  try {
    const rows = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return Array.isArray(rows) ? rows.map(String) : [];
  } catch {
    return [];
  }
}

function pendingLabReferralCount({
  appointments,
  consultationReferrals,
  orders,
}: {
  appointments: any[];
  consultationReferrals: any[];
  orders: any[];
}) {
  const orderedConsultationIds = new Set(
    orders.map((order: any) => String(order.consultation_id || "")).filter(Boolean),
  );
  const dismissedIds = new Set(
    readDismissedConsultationIds("medizinhub.labDismissedConsultations"),
  );
  const sourceRows = consultationReferrals.length
    ? consultationReferrals.map((row: any) => ({
        consultationId: row.consultation_id,
        consultationStatus: row.status,
        labReferralText: row.lab_referral_text,
      }))
    : appointments;

  return sourceRows.filter((row: any) => {
    const consultationId = String(row.consultationId || "");
    return (
      consultationId &&
      normalizedStatus(row.consultationStatus) === "signed" &&
      String(row.labReferralText || "").trim() &&
      !orderedConsultationIds.has(consultationId) &&
      !dismissedIds.has(consultationId)
    );
  }).length;
}

function pendingPrescriptionCount({
  appointments,
  issues,
}: {
  appointments: any[];
  issues: any[];
}) {
  const issuedConsultationIds = new Set(
    issues.map((issue: any) => String(issue.consultation_id || "")).filter(Boolean),
  );
  const dismissedIds = new Set(
    readDismissedConsultationIds("medizinhub.pharmacyDismissedConsultations"),
  );

  return appointments.filter((row: any) => {
    const consultationId = String(row.consultationId || "");
    return (
      consultationId &&
      normalizedStatus(row.consultationStatus) === "signed" &&
      String(row.prescriptionText || "").trim() &&
      !issuedConsultationIds.has(consultationId) &&
      !dismissedIds.has(consultationId)
    );
  }).length;
}

export function OPDWorkspace({
  section = "appointments",
  appointmentId = "",
  setActive,
  ...workspace
}: OPDWorkspaceProps) {
  const router = useRouter();
  const permissionKeys = workspace.apiSession?.user?.permissions || [];
  const isTenantAdmin = Boolean(
    workspace.apiSession?.user?.user_type === "tenant_admin" ||
      workspace.apiSession?.user?.roles?.includes("tenant_admin"),
  );
  const hasAnyPermission = (keys: readonly string[]) => {
    if (!workspace.apiSession) return true;
    if (workspace.apiSession.user?.is_super_admin) return true;
    if (permissionKeys.includes("*")) return true;
    if (isTenantAdmin) return true;
    return keys.some((key) => permissionKeys.includes(key));
  };
  const visibleTabs = sectionTabs.filter((tab) =>
    hasAnyPermission(tab.permissions),
  );
  const canCreateAppointment = hasAnyPermission([
    "appointments.create",
    "appointments.manage",
  ]);
  const effectiveSection =
    section === "new" && canCreateAppointment
      ? "new"
      : visibleTabs.some((tab) => tab.id === section)
        ? section
        : visibleTabs[0]?.id || "consultation";
  const canLoadBillingQueue = hasAnyPermission([
    "billing.manage",
    "billing.create",
    "invoices.create",
  ]);
  const canLoadPaymentsQueue = hasAnyPermission([
    "billing.manage",
    "payments.manage",
    "payments.create",
  ]);
  const departmentOptions = uniqueDepartmentRows(
    workspace.allowedDepartments || [],
    workspace.departmentId,
  );
  const appointments = workspace.appointments || [];
  const [billingPendingCount, setBillingPendingCount] = useState(0);
  const [paymentPendingCount, setPaymentPendingCount] = useState(0);
  const [labReferralPendingCount, setLabReferralPendingCount] = useState(0);
  const [prescriptionPendingCount, setPrescriptionPendingCount] = useState(0);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    if (!workspace.apiSession || (!canLoadBillingQueue && !canLoadPaymentsQueue)) {
      setBillingPendingCount(0);
      setPaymentPendingCount(0);
      return;
    }
    Promise.all([
      canLoadBillingQueue
        ? fetchOPDBillingQueueRows({
            apiSession: workspace.apiSession,
            branchId: workspace.branchId,
          })
        : Promise.resolve([]),
      canLoadPaymentsQueue
        ? fetchOPDPaymentQueueRows({
            apiSession: workspace.apiSession,
            branchId: workspace.branchId,
          })
        : Promise.resolve([]),
    ])
      .then(([billingRows, paymentRows]) => {
        if (cancelled) return;
        setBillingPendingCount(billingRows.length);
        setPaymentPendingCount(paymentRows.length);
      })
      .catch(() => {
        if (!cancelled) {
          setBillingPendingCount(0);
          setPaymentPendingCount(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    workspace.apiSession,
    workspace.branchId,
    appointments.length,
    canLoadBillingQueue,
    canLoadPaymentsQueue,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!workspace.apiSession) {
      setLabReferralPendingCount(0);
      setPrescriptionPendingCount(0);
      return;
    }

    Promise.all([
      hasAnyPermission(["lab.read", "lab.create", "lab.edit", "lab.manage"])
        ? Promise.all([
            listConsultationReferrals(workspace.apiSession).catch(() => []),
            listOrders(workspace.apiSession).catch(() => []),
          ])
        : Promise.resolve([[], []]),
      hasAnyPermission([
        "pharmacy.read",
        "pharmacy.create",
        "pharmacy.edit",
        "pharmacy.manage",
      ])
        ? fetchPharmacyIssues(workspace.apiSession).catch(() => [])
        : Promise.resolve([]),
    ]).then(([[consultationReferrals, orders], issues]) => {
      if (cancelled) return;
      setLabReferralPendingCount(
        pendingLabReferralCount({
          appointments,
          consultationReferrals,
          orders,
        }),
      );
      setPrescriptionPendingCount(
        pendingPrescriptionCount({ appointments, issues }),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [
    workspace.apiSession,
    workspace.branchId,
    appointments.length,
    workspace.departmentId,
    permissionKeys.join("|"),
  ]);

  const tabCounts: Record<string, number> = {
    appointments: appointments.length,
    consultation: appointments.filter((row: any) =>
      ["waiting", "called", "in_consultation", "draft"].includes(
        normalizedStatus(
          row.consultationStatus || row.consultation_status || row.status,
        ),
      ),
    ).length,
    "lab-services": labReferralPendingCount,
    prescriptions: prescriptionPendingCount,
    invoices: billingPendingCount,
    payments: paymentPendingCount,
  };

  useEffect(() => {
    const activeTabId =
      effectiveSection === "new" ? "appointments" : effectiveSection;
    tabRefs.current[activeTabId]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [effectiveSection]);

  const openSection = (path: string) => {
    router.push(path);
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  };
  const openAppointment = (id: string) => {
    if (!id) return;
    const appointment = (workspace.appointments || []).find(
      (row: any) => String(row.id) === String(id),
    );
    const departmentId =
      appointment?.departmentId || appointment?.department_id || "";
    if (
      departmentId &&
      departmentId !== workspace.departmentId &&
      workspace.setDepartmentId
    ) {
      workspace.setDepartmentId(departmentId);
    }
    router.push(opdAppointmentPath(id));
  };

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm max-w-[90vw] lg:max-w-[78vw]">
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-brand">
                <ClipboardList className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-black tracking-tight text-slate-950">
                  OPD Workspace
                </h2>
                <p className="text-xs font-medium text-slate-500">
                  Appointments, consultation, diagnostics and billing in one workspace
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {departmentOptions.length > 0 && (
              <div className="flex min-w-[250px] items-center gap-2">
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Department
                </span>
                <div className="min-w-0 flex-1">
                  <SearchableSelect
                    value={workspace.departmentId}
                    onChange={workspace.setDepartmentId}
                    options={departmentOptions.map((department: any) => ({
                      value: department.id,
                      label: department.name,
                    }))}
                    searchable={false}
                    placeholder="Select department"
                  />
                </div>
              </div>
            )}
            {canCreateAppointment && (
              <button
                type="button"
                onClick={() => openSection("/opd/new")}
                className="primary-action h-9 gap-2 whitespace-nowrap px-4 text-xs"
              >
                <PlusCircle size={16} />
                New Appointment
              </button>
            )}
          </div>
        </div>

        <nav
          className="scrollbar-hidden flex gap-1 overflow-x-auto border-t border-slate-200 bg-slate-50 px-3 py-1.5"
          aria-label="OPD workspace sections"
        >
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active =
              effectiveSection === tab.id ||
              (effectiveSection === "new" && tab.id === "appointments");
            return (
              <button
                key={tab.id}
                ref={(node) => {
                  tabRefs.current[tab.id] = node;
                }}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => openSection(tab.path)}
                className={`inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-bold transition-colors ${
                  active
                    ? "bg-brand text-brand-fg"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                <span className="grid h-5 w-6 place-items-center">
                  {tabCounts[tab.id] ? (
                  <span
                    className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] ${
                      active
                        ? "bg-white text-emerald-600"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {tabCounts[tab.id]}
                  </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </nav>
      </section>

      {effectiveSection === "appointments" || effectiveSection === "new" ? (
        <AppointmentCalendarBooking
          {...workspace}
          setActive={setActive}
          mode={effectiveSection === "new" ? "book" : "list"}
          routeBase="/opd"
          onOpenAppointment={openAppointment}
        />
      ) : effectiveSection === "schedule" ? (
        <DoctorConsultation
          {...workspace}
          setActive={setActive}
          view="dashboard"
          onOpenAppointment={openAppointment}
        />
      ) : effectiveSection === "lab-services" ? (
        <Lab
          {...workspace}
          setActive={setActive}
          workspaceMode="consultation"
          onConsultationPendingCountChange={setLabReferralPendingCount}
        />
      ) : effectiveSection === "prescriptions" ? (
        <Pharmacy
          {...workspace}
          workspaceMode="consultation"
          onConsultationPendingCountChange={setPrescriptionPendingCount}
        />
      ) : effectiveSection === "invoices" ? (
        <OPDInvoiceQueue
          apiSession={workspace.apiSession}
          branchId={workspace.branchId}
          appointments={workspace.appointments}
          onOpenInvoices={() => setActive?.("billing")}
        />
      ) : effectiveSection === "payments" ? (
        <OPDPaymentQueue
          apiSession={workspace.apiSession}
          branchId={workspace.branchId}
          onOpenInvoice={(invoice: any) => {
            if (typeof window !== "undefined") {
              window.sessionStorage.setItem(
                "medizinhub.billingInvoiceId",
                invoice.id,
              );
            }
            setActive?.("billing");
          }}
        />
      ) : effectiveSection === "templates" ? (
        <ClinicalTemplateManager
          apiSession={workspace.apiSession}
          branchId={workspace.branchId}
          departmentId={workspace.departmentId}
          allowedDepartments={workspace.allowedDepartments}
          medicineCatalog={workspace.medicineCatalog}
          labCatalog={workspace.labCatalog}
        />
      ) : (
        <DoctorConsultation
          {...workspace}
          setActive={setActive}
          view="workspace"
          appointmentId={appointmentId}
          onOpenAppointment={openAppointment}
          onOpenConsultationInvoices={() => openSection("/opd/invoices")}
        />
      )}
    </div>
  );
}
