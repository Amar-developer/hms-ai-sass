import { displayDate, money, patientName } from "@/utils/helper";
import { bookingTotal, isBookingLocked, patientCode, userName, userTypeKey } from "../helpers";
import { humanizeOptionLabel } from "@/lib/options";
import { Info } from "@/app/components/common/Info";
import { ActivityLog } from "@/app/components/common/ActivityLog";
import { SearchableSelect,ActionButton,ActionGroup,Button,Card, Input,Badge } from "@/app/components/common/ui";
import { homeCareHourPrices, staffTypeOptions, visitLogStatuses } from "../constants";
import { DateField, FormField, NumberField, SearchableSelectField, SelectField, TextareaField } from "@/app/components/FormElements";
import { homeCareHourOptions } from "../forms/HomeCareForms";


export function BookingDetail({
  booking,
  patientMap,
  staffMap,
  staff = [],
  services = [],
  visitForm,
  setVisitField,
  saveVisitLog,
  deleteVisitLog,
  busy,
  invoiceDetail,
  onBack,
  onEdit,
  onCancel,
  onInvoice,
  onOpenInvoiceModule,
  canManage = false,
  canCreateVisit = false,
  apiSession,
}: any) {
  if (!booking) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Booking not found.</p>
        <div className="mt-4">
          <ActionButton onClick={onBack}>Back to list</ActionButton>
        </div>
      </Card>
    );
  }
  const patient = patientMap.get(booking.patient_id);
  const locked = isBookingLocked(booking);
  const filteredVisitStaff = (staff || []).filter(
    (user: any) =>
      visitForm?.staff_type === "users" ||
      userTypeKey(user) === visitForm?.staff_type,
  );
  const visitServices = (services || []).filter((service: any) =>
    String(service.code || "")
      .toUpperCase()
      .startsWith("HV"),
  );
  const isHomeVisitBooking =
    (booking.services || []).some(
      (row: any) => row.service_category === "home_visit_service",
    ) ||
    (booking.visit_logs || []).some(
      (row: any) => row.service_category === "home_visit_service",
    );
  const fixedServiceCategory = isHomeVisitBooking
    ? "home_visit_service"
    : "home_care_service";
  const actualTotal = (booking.visit_logs || [])
    .filter((row: any) => row.status === "completed")
    .reduce((sum: number, row: any) => sum + Number(row.unit_amount || 0), 0);
  const hasBillableLog = (booking.visit_logs || []).some(
    (row: any) => row.status === "completed",
  );
  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <h3 className="text-lg font-bold">{booking.booking_number}</h3>
            <p className="text-xs text-slate-500">
              {patientName(patient)} ·{" "}
              {patientCode(patient) || patient?.mobile || ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="normal-badge">
              {humanizeOptionLabel(booking.status)}
            </Badge>
            <ActionButton onClick={onBack}>Back to list</ActionButton>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3 md:max-w-2xl lg:max-w-4xl">
          <Info title="Patient" value={patientName(patient)} />
          <Info
            title="Recurrence"
            value={humanizeOptionLabel(booking.recurrence || "daily")}
          />
          <Info title="Start Date" value={displayDate(booking.start_date)} />
          <Info title="End Date" value={displayDate(booking.end_date)} />
          <Info title="Total" value={money(bookingTotal(booking))} />
        </div>
        {(booking.location || booking.complaints || booking.notes) && (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {booking.location && (
              <div className="rounded-lg bg-slate-50 p-3 text-xs">
                <p className="font-bold uppercase text-slate-500">Location</p>
                <p className="mt-1 text-slate-700">{booking.location}</p>
              </div>
            )}
            {booking.complaints && (
              <div className="rounded-lg bg-slate-50 p-3 text-xs">
                <p className="font-bold uppercase text-slate-500">Complaints</p>
                <p className="mt-1 text-slate-700">{booking.complaints}</p>
              </div>
            )}
            {booking.notes && (
              <div className="rounded-lg bg-slate-50 p-3 text-xs">
                <p className="font-bold uppercase text-slate-500">Notes</p>
                <p className="mt-1 text-slate-700">{booking.notes}</p>
              </div>
            )}
          </div>
        )}
        <div className="mt-4 rounded-2xl bg-slate-50 p-4 md:max-w-2xl lg:max-w-5xl">
          <div className="mb-3 flex flex-col justify-between gap-2 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">
                Actual Service Logs
              </p>
              <p className="text-xs text-slate-500">
                Bill only completed visits. Missed or cancelled days stay
                tracked with zero amount.
              </p>
            </div>
            <Badge tone="blue" className="normal-badge">
              Billable total {money(actualTotal)}
            </Badge>
          </div>
          {!locked && visitForm && canCreateVisit && (
            <form
              onSubmit={saveVisitLog}
              className="grid gap-3 rounded-xl bg-white p-3 md:grid-cols-4"
            >
              <DateField
                label="Service Date"
                value={visitForm.visit_date}
                onChange={(value: string) => setVisitField("visit_date", value)}
                required
              />
              <FormField label="Staff Type" required>
                <SearchableSelect
                  value={visitForm.staff_type}
                  onChange={(value: string) =>
                    setVisitField("staff_type", value)
                  }
                  options={staffTypeOptions.map(([value, label]) => ({
                    value,
                    label,
                  }))}
                  searchable={false}
                  required
                />
              </FormField>
              <FormField label="Staff Went" required>
                <SearchableSelect
                  value={visitForm.assigned_staff_user_id}
                  onChange={(value: string) => {
                    const selectedStaff = staffMap.get(value);
                    setVisitField("assigned_staff_user_id", value);
                    setVisitField(
                      "assigned_staff_name",
                      selectedStaff ? userName(selectedStaff) : "",
                    );
                  }}
                  options={[
                    {
                      value: "",
                      label: filteredVisitStaff.length
                        ? "Select staff"
                        : "No staff found",
                    },
                    ...filteredVisitStaff.map((user: any) => ({
                      value: user.id,
                      label: userName(user),
                    })),
                  ]}
                  searchable={false}
                  required
                />
              </FormField>
              <FormField label="Status" required>
                <SearchableSelect
                  value={visitForm.status}
                  onChange={(value: string) => setVisitField("status", value)}
                  options={visitLogStatuses}
                  searchable={false}
                  required
                />
              </FormField>
              <div>
                <p className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Service Type
                </p>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-bold">
                  {isHomeVisitBooking
                    ? "Home Visit Service"
                    : "Home Care Service"}
                </div>
              </div>
              {fixedServiceCategory === "home_visit_service" ? (
                <SearchableSelectField
                  label="Visit Service"
                  value={visitForm.service_id}
                  onChange={(value: string) =>
                    setVisitField("service_id", value)
                  }
                  options={[
                    { value: "", label: "Select visit service" },
                    ...visitServices.map((service: any) => ({
                      value: service.id,
                      label: service.name,
                      sublabel: money(service.default_price),
                    })),
                  ]}
                  required
                />
              ) : (
                <FormField label="Service Name" required>
                  <Input
                    value={visitForm.description}
                    onChange={(event: any) =>
                      setVisitField("description", event.target.value)
                    }
                    placeholder="Type actual service done"
                    required
                  />
                </FormField>
              )}
              {fixedServiceCategory === "home_care_service" ? (
                <SelectField
                  label="Hours"
                  value={visitForm.quantity}
                  onChange={(value: string) => setVisitField("quantity", value)}
                  options={[
                    ...(homeCareHourPrices[String(visitForm.quantity)]
                      ? []
                      : [
                          {
                            value: String(visitForm.quantity || ""),
                            label: `${visitForm.quantity || 0} hours - custom`,
                          },
                        ]),
                    ...homeCareHourOptions,
                  ]}
                  required
                />
              ) : null}
              <NumberField
                label={
                  fixedServiceCategory === "home_visit_service"
                    ? "Service Price"
                    : "Price"
                }
                value={visitForm.unit_amount}
                onChange={(value: string) =>
                  setVisitField("unit_amount", value)
                }
                min={0}
                required
                className={
                  fixedServiceCategory === "home_visit_service"
                    ? "md:col-start-3"
                    : ""
                }
              />
              <TextareaField
                label="Notes"
                value={visitForm.notes}
                onChange={(value: string) => setVisitField("notes", value)}
                rows={2}
                className="md:col-span-3"
              />
              <div className="flex items-end">
                <Button disabled={busy === "visit-log"} className="save-button">
                  {busy === "visit-log" ? "Saving..." : "Add Log"}
                </Button>
              </div>
            </form>
          )}
          <div className="mt-3 overflow-auto rounded-xl border bg-white">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="bg-slate-50 uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th>Staff</th>
                  <th>Service</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th className="pr-3 text-right">Amount</th>
                  {!locked && canManage && (
                    <th className="pr-3 text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y py-2">
                {(booking.visit_logs || []).length === 0 && (
                  <tr>
                    <td
                      colSpan={locked ? 7 : 8}
                      className="px-3 py-3 text-slate-500"
                    >
                      No actual service logs yet.
                    </td>
                  </tr>
                )}
                {(booking.visit_logs || []).map((row: any) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">{displayDate(row.visit_date)}</td>
                    <td>
                      {row.assigned_staff_name ||
                        userName(staffMap.get(row.assigned_staff_user_id))}
                    </td>
                    <td>
                      {row.description}
                      <p className="text-slate-400">
                        {humanizeOptionLabel(
                          row.service_category || "home_care_service",
                        )}
                      </p>
                    </td>
                    <td>{row.quantity}</td>
                    <td>{money(row.unit_amount)}</td>
                    <td>{humanizeOptionLabel(row.status)}</td>
                    <td className="pr-3 text-right">
                      {money(row.status === "completed" ? row.unit_amount : 0)}
                    </td>
                    {!locked && canManage && (
                      <td className="pr-3 text-right">
                        <ActionButton
                          tone="danger"
                          onClick={() => deleteVisitLog(row.id)}
                          disabled={busy === `delete-visit-${row.id}`}
                        >
                          Delete
                        </ActionButton>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {canManage && (
            <ActionButton
              onClick={onEdit}
              disabled={locked}
              title={locked ? "Locked after billing/completion" : undefined}
            >
              Edit
            </ActionButton>
          )}
          {canManage && (
            <ActionButton
              tone="danger"
              onClick={onCancel}
              disabled={locked || busy === "cancel-booking"}
              title={locked ? "Locked after billing/completion" : undefined}
            >
              {busy === "cancel-booking" ? "Cancelling..." : "Cancel Booking"}
            </ActionButton>
          )}
          {(invoiceDetail?.invoice ||
            String(booking.status).toLowerCase() !== "cancelled") && (
            <Button
              type="button"
              className="rounded-lg px-3 py-2 text-xs"
              onClick={invoiceDetail?.invoice ? onOpenInvoiceModule : onInvoice}
              disabled={!invoiceDetail?.invoice && !hasBillableLog}
              title={
                !invoiceDetail?.invoice && !hasBillableLog
                  ? "Add at least one completed service log before generating an invoice"
                  : undefined
              }
            >
              {invoiceDetail?.invoice ? "View Invoice" : "Generate Invoice"}
            </Button>
          )}
          {locked && (
            <span className="text-xs font-bold text-slate-400">
              🔒 {humanizeOptionLabel(booking.status)} — editing locked
            </span>
          )}
        </div>
      </Card>
      <Card>
        <h3 className="text-base font-bold">Billing Summary</h3>
        {invoiceDetail?.invoice ? (
          <div className="mt-4 rounded-2xl border p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <b>{invoiceDetail.invoice.invoice_number}</b>
              <Badge>{humanizeOptionLabel(invoiceDetail.invoice.status)}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-slate-600">
              <span>Total</span>
              <b className="text-right text-slate-900">
                {money(invoiceDetail.invoice.total_amount)}
              </b>
              <span>Paid</span>
              <b className="text-right text-slate-900">
                {money(invoiceDetail.invoice.paid_amount)}
              </b>
              <span>Balance</span>
              <b className="text-right text-slate-900">
                {money(invoiceDetail.invoice.balance_amount)}
              </b>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
            No invoice generated yet. Use Generate Invoice to bill this booking.
          </p>
        )}
      </Card>
      <ActivityLog resourceType="home_care_booking" resourceId={booking?.id} apiSession={apiSession} />
    </div>
  );
}
