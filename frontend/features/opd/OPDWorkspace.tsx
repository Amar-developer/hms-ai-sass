"use client";

import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Clock3,
  ClipboardList,
  LayoutTemplate,
  ReceiptText,
  Plus,
  Stethoscope,
} from "lucide-react";

import { AppointmentCalendarBooking } from "@/features/appointments/AppointmentCalendarBooking";
import { SearchableSelect } from "@/app/components/common/ui";
import type { Props as AppointmentWorkspaceProps } from "@/features/appointments/types";
import { DoctorConsultation } from "@/features/consulation/DoctorConsultation";
import { uniqueDepartmentRows } from "@/lib/options";
import { opdAppointmentPath } from "./routing";
import { OPDInvoiceQueue } from "./components/OPDInvoiceQueue";
import { ClinicalTemplateManager } from "./components/ClinicalTemplateManager";

export type OPDSection =
  | "consultation"
  | "invoices"
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
  },
  {
    id: "schedule",
    label: "Doctor Schedule",
    icon: Clock3,
    path: "/opd/schedule",
  },
  {
    id: "consultation",
    label: "Consultation",
    icon: Stethoscope,
    path: "/opd",
  },
  {
    id: "invoices",
    label: "Invoices",
    icon: ReceiptText,
    path: "/opd/invoices",
  },
  {
    id: "templates",
    label: "Templates",
    icon: LayoutTemplate,
    path: "/opd/templates",
  },
] as const;

export function OPDWorkspace({
  section = "consultation",
  appointmentId = "",
  setActive,
  ...workspace
}: OPDWorkspaceProps) {
  const router = useRouter();
  const departmentOptions = uniqueDepartmentRows(
    workspace.allowedDepartments || [],
    workspace.departmentId,
  );

  const openSection = (path: string) => router.push(path);
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
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-brand">
                <ClipboardList className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-black tracking-tight text-slate-950">
                  OPD Workspace
                </h2>
                <p className="text-xs font-medium text-slate-500">
                  Appointments and consultation in one clinical workspace
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
            <button
              type="button"
              onClick={() => openSection("/opd/new")}
              className="primary-action h-9 gap-2 whitespace-nowrap px-4 text-xs"
            >
              <Plus className="h-4 w-4" />
              New Appointment
            </button>
          </div>
        </div>

        <nav
          className="flex gap-1 overflow-x-auto border-t border-slate-200 bg-slate-50 px-3 py-1.5"
          aria-label="OPD workspace sections"
        >
          {sectionTabs.map((tab) => {
            const Icon = tab.icon;
            const active =
              section === tab.id ||
              (section === "new" && tab.id === "appointments");
            return (
              <button
                key={tab.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => openSection(tab.path)}
                className={`inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-bold transition ${
                  active
                    ? "bg-white text-brand shadow-sm ring-1 ring-slate-200"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </section>

      {section === "appointments" || section === "new" ? (
        <AppointmentCalendarBooking
          {...workspace}
          setActive={setActive}
          mode={section === "new" ? "book" : "list"}
          routeBase="/opd"
          onOpenAppointment={openAppointment}
        />
      ) : section === "schedule" ? (
        <DoctorConsultation
          {...workspace}
          setActive={setActive}
          view="dashboard"
          onOpenAppointment={openAppointment}
        />
      ) : section === "invoices" ? (
        <OPDInvoiceQueue
          apiSession={workspace.apiSession}
          branchId={workspace.branchId}
          onOpenInvoices={() => setActive?.("billing")}
        />
      ) : section === "templates" ? (
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
