import { Card, RefreshButton,Button, Input, SearchableSelect, ActionButton,ActionGroup,Badge } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { statuses } from "../constants";
import { capitalizeFirst, displayDate, money, patientName } from "@/utils/helper";
import { bookingTotal, isBookingLocked, userName } from "../helpers";
import { humanizeOptionLabel } from "@/lib/options";
import { Pagination } from "@/app/components/common/Pagination";


export function BookingsList({
  bookings,
  total,
  page,
  totalPages,
  onPage,
  filters,
  setFilters,
  patientMap,
  staffMap,
  onRefresh,
  onCreate,
  onView,
  onEdit,
  onInvoice,
  canManage = false,
  canCreate = false,
}: any) {
  return (
    <Card>
      <div className="flex flex-col gap-3  lg:items-end lg:justify-between">
        <div className=" w-full flex justify-between">
          <div>
            {" "}
            <h3 className="card-title font-bold">Home Care / Visit Booking</h3>
            <p className="card-desc text-slate-500">
              Create patient-linked home care and visit bookings. bookings.
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <RefreshButton onRefresh={onRefresh} />
            {canCreate && (
              <Button type="button" onClick={onCreate} className="save-button">
                New Booking
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3 md:items-end justify-start w-full">
          <FormField label="Search">
            <Input
              value={filters.query}
              onChange={(event: any) =>
                setFilters({ ...filters, query: event.target.value })
              }
              placeholder="Booking, patient, staff, status"
            />
          </FormField>
          <FormField label="Status">
            <SearchableSelect
              value={filters.status}
              onChange={(value: string) =>
                setFilters({ ...filters, status: value })
              }
              options={[
                { value: "all", label: "All statuses" },
                ...statuses.map(([value, label]) => ({ value, label })),
              ]}
              searchable={false}
            />
          </FormField>
        </div>
      </div>

      <div className="mt-4 overflow-auto rounded-2xl border">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Booking</th>
              <th>Patient</th>
              <th>Staff</th>
              <th>Date Range</th>
              <th>Status</th>
              <th className=" w-[120px] text-center">Total</th>
              <th className="pr-4 w-[220px]  text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {bookings.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-slate-500">
                  No home care / visit bookings match your filter.
                </td>
              </tr>
            )}
            {bookings.map((booking: any) => {
              const patient: any = patientMap.get(booking.patient_id);
              return (
                <tr key={booking.id}>
                  <td className="px-4 py-3">
                    <b className="card-desc">{booking.booking_number}</b>
                    <p className="text-xs text-slate-500">
                      {booking.services?.length || 0} services
                    </p>
                  </td>
                  <td className="card-desc">
                    {capitalizeFirst(patientName(patient))}
                  </td>
                  <td className="card-desc">
                    {booking.assigned_staff_name ||
                      userName(staffMap.get(booking.assigned_staff_user_id))}
                    {booking.staff_type && (
                      <p className="text-xs text-slate-500">
                        {humanizeOptionLabel(booking.staff_type)}
                      </p>
                    )}
                  </td>
                  <td className="card-desc">
                    {displayDate(booking.start_date)} to{" "}
                    {displayDate(booking.end_date)}
                    <p className="text-xs text-slate-500">
                      {humanizeOptionLabel(booking.recurrence || "daily")}
                    </p>
                  </td>
                  <td className="card-desc">
                    <Badge className="normal-badge">
                      {humanizeOptionLabel(booking.status)}
                    </Badge>
                  </td>
                  <td className="card-desc text-center">
                    {money(bookingTotal(booking))}
                  </td>
                  <td className="pr-4">
                    <ActionGroup className="justify-end">
                      <ActionButton onClick={() => onView(booking)}>
                        View
                      </ActionButton>
                      {canManage && (
                        <ActionButton
                          onClick={() => onEdit(booking)}
                          disabled={isBookingLocked(booking)}
                          title={
                            isBookingLocked(booking)
                              ? "Locked after billing/completion"
                              : undefined
                          }
                        >
                          Edit
                        </ActionButton>
                      )}
                      <ActionButton onClick={() => onInvoice(booking)}>
                        Invoice
                      </ActionButton>
                    </ActionGroup>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        onPage={onPage}
      />
    </Card>
  );
}
