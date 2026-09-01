import { CalendarPlus, CalendarClock } from "lucide-react";
import {
  Button,
  Card,
  Input,
  StatusToast,
} from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { Pagination } from "@/app/components/common/Pagination";
import { today } from "@/utils/helper";
import { DataTable } from "@/app/components/common/DataTable";

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
    showBookingAction = true,
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
    <Card className="">
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
        {/* <div>
          <h3 className="card-title font-bold">Appointments</h3>
          <p className="card-desc text-slate-500">
            {isSuperAdmin
              ? "Combined all-tenant appointment grid for MedizinHub HMS primary tenant."
              : "Row based OP appointment view with patient, mobile, medical department, doctor, date, and consultation status."}
          </p>
        </div> */}
        {showBookingAction && (
          <Button
            onClick={openBooking}
            className="flex items-center justify-between rounded-lg gap-2 w-40 lg:w-44 text-xs px-3 py-2 lg:px-4 lg:py-3"
          >
            <div className="flex justify-center">
              <CalendarPlus size={16} />
              <p className="pl-2">New Appointment</p>
            </div>
          </Button>
        )}
      </div>
      <div className="w-full overflow-x-auto">
        <DataTable
          columns={columns}
          className="w-full min-w-[700px] scrollbar-hidden"
          data={rows}
          loading={rowsLoading}
          emptyMessage="No appointments found."
          emptyDescription="Booked OP appointments with patient, doctor, and consultation status will show up here."
          emptyIcon={CalendarClock}
          minBodyHeight={`${rows.length > 0 ?'':'220px'}`}
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
