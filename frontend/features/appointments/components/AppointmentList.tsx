import { CalendarPlus } from "lucide-react";
import {
  Button,
  Card,
  Input,
  SearchableSelect,
  StatusToast,
} from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { Pagination } from "@/app/components/common/Pagination";
import { DataTable } from "@/features/reports/components/DataTable";
import { today } from "@/utils/helper";
import { APPOINTMENT_STATUS_FILTER_OPTIONS } from "../constants";

export function AppointmentList(props: any) {
  const {
    message,
    setMessage,
    isSuperAdmin,
    rescheduleAppointment,
    setRescheduleAppointment,
    rescheduleDate,
    setRescheduleDate,
    rescheduleBusy,
    saveReschedule,
    openBooking,
    platformTenantId,
    setPlatformTenantId,
    platformTenants,
    query,
    setQuery,
    filterDate,
    setFilterDate,
    platformDepartment,
    setPlatformDepartment,
    normalizedPlatformDepartmentOptions,
    filterDepartment,
    setFilterDepartment,
    normalizedDepartmentOptions,
    filterStatus,
    setFilterStatus,
    columns,
    rows,
    rowsLoading,
    onRowClick,
    safePage,
    totalPages,
    total,
    setPage,
  } = props;

  return (
    <Card>
      {rescheduleAppointment && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">Reschedule Appointment</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {rescheduleAppointment.patient || "Patient"}
                </p>
              </div>
              <button
                type="button"
                disabled={rescheduleBusy}
                onClick={() => setRescheduleAppointment(null)}
                className="close-button font-bold"
              >
                Close
              </button>
            </div>
            <div className="mt-5">
              <FormField label="New Appointment Date" required>
                <Input
                  required
                  type="date"
                  min={today()}
                  value={rescheduleDate}
                  onChange={(event: any) =>
                    setRescheduleDate(event.target.value)
                  }
                />
              </FormField>
              <p className="mt-2 text-xs text-slate-500">
                Consultation time and token will be reassigned from the
                doctor&apos;s available schedule.
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                disabled={
                  rescheduleBusy ||
                  !rescheduleDate ||
                  rescheduleDate ===
                    String(
                      rescheduleAppointment.appointmentDate ||
                        rescheduleAppointment.appointment_date ||
                        "",
                    ).slice(0, 10)
                }
                onClick={saveReschedule}
              >
                {rescheduleBusy ? "Rescheduling..." : "Reschedule"}
              </Button>
            </div>
          </Card>
        </div>
      )}
      <StatusToast message={message} onClose={() => setMessage("")} />
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="card-title font-bold">Appointments</h3>
          <p className="card-desc text-slate-500">
            {isSuperAdmin
              ? "Combined all-tenant appointment grid for MedizinHub HMS primary tenant."
              : "Row based OP appointment view with patient, mobile, medical department, doctor, date, and consultation status."}
          </p>
        </div>
        <Button
          onClick={openBooking}
          className="flex items-center justify-between rounded-lg gap-2 w-40 lg:w-44 text-xs  px-3 py-2 lg:px-4 lg:py-3"
        >
          <div className="flex justify-center">
            <CalendarPlus size={16} />
            <p className="pl-2">New Appointment </p>
          </div>
        </Button>
      </div>
      <div className="mt-4 grid gap-3 grid-cols-2 md:grid-cols-5">
        {isSuperAdmin && (
          <FormField label="Clinic / Tenant">
            <SearchableSelect
              value={platformTenantId}
              onChange={setPlatformTenantId}
              options={[
                { value: "", label: "All tenants" },
                ...platformTenants
                  .filter((t: any) => !t.is_primary)
                  .map((t: any) => ({ value: t.id, label: t.name })),
              ]}
            />
          </FormField>
        )}
        <FormField label="Patient name">
          <Input
            value={query}
            onChange={(e: any) => setQuery(e.target.value)}
            placeholder="Search patient or mobile or doctor name"
          />
        </FormField>
        <FormField label="Select date">
          <Input
            type="date"
            value={filterDate}
            onChange={(e: any) => setFilterDate(e.target.value)}
          />
        </FormField>
        <FormField label="Department">
          {isSuperAdmin ? (
            <SearchableSelect
              value={platformDepartment}
              onChange={(val: string) => setPlatformDepartment(val)}
              options={normalizedPlatformDepartmentOptions}
              placeholder="All Departments"
              searchable={false}
            />
          ) : (
            <SearchableSelect
              value={filterDepartment}
              onChange={(val: string) => setFilterDepartment(val)}
              options={[
                { value: "all", label: "All Departments" },
                ...normalizedDepartmentOptions,
              ]}
              placeholder="All Departments"
              searchable={false}
            />
          )}
        </FormField>
        {!isSuperAdmin && (
          <FormField label="Status">
            <SearchableSelect
              value={filterStatus}
              onChange={(val: string) => setFilterStatus(val)}
              options={APPOINTMENT_STATUS_FILTER_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              placeholder="Select status"
              searchable={false}
            />
          </FormField>
        )}
        <div className="flex items-end">
          <Button
            className="h-[50%] w-[50%] text-sm"
            type="button"
            onClick={() => {
              setPlatformTenantId("");
              setQuery("");
              setFilterDate("");
              setFilterDepartment("all");
              setPlatformDepartment("all");
              setFilterStatus("all");
            }}
          >
            Reset
          </Button>
        </div>
      </div>
      <div className="mt-4">
        <DataTable
          columns={columns}
          className="overflow-x-auto max-w-[1000px] scrollbar-thin"
          data={rows}
          loading={rowsLoading}
          emptyMessage="No appointments found."
          onRowClick={onRowClick}
        />
      </div>
      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={total}
        onPage={setPage}
      />
    </Card>
  );
}
