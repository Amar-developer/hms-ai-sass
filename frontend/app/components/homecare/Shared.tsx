import { staffTypeOptions, statuses } from "@/utils/homecare/constants";
import {
  Card,
  Badge,
  Button,
  RefreshButton,
  ActionButton,
  ActionGroup,
  SearchableSelect,
} from "../common/ui";
import {
  DateField,
  TextField,
  SelectField,
  SearchableSelectField,
  NumberField,
  TextareaField,
  FormField,
} from "../FormElements";
import {
  bookingTotal,
  isBookingLocked,
  money,
  patientCode,
  patientName,
  userTypeKey,
  userName,
} from "@/utils/homecare/helpers";
import { humanizeOptionLabel } from "@/lib/options";
import { capitalizeFirst, displayDate } from "@/utils/helper";

const homeCareHourPrices: Record<string, string> = {
  "2": "500",
  "4": "800",
  "8": "1000",
  "10": "1100",
  "12": "1200",
  "24": "1500",
};

const homeCareHourOptions = Object.entries(homeCareHourPrices).map(
  ([value, price]) => ({
    value,
    label: `${value} hours - ${money(price)}`,
  }),
);

const visitLogStatuses = [
  { value: "completed", label: "Completed / Billable" },
  { value: "missed", label: "Missed / Not billable" },
  { value: "cancelled", label: "Cancelled / Not billable" },
];

export function Header({ view, count, onList, onCreate }: any) {
  const listActive =
    view === "list" || view === "view" || view === "edit" || view === "invoice";
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h3 className="card-title font-bold">Home Care / Visit Booking</h3>
        <p className="card-desc text-slate-500">
          Create patient-linked home care and visit bookings. {count} total
          bookings.
        </p>
      </div>
      <div className="grid gap-1 sm:grid-cols-1">
        {/* <Tab active={listActive} onClick={onList} className="save-button">
          Booked List
        </Tab>
        <Tab
          active={view === "create"}
          onClick={onCreate}
          className="close-button"
        >
          New Booking
        </Tab> */}
        <Button
          type="button"
          onClick={onCreate}
          className="save-button text-xs"
        >
          New Booking
        </Button>
      </div>
    </div>
  );
}

export function Tab({
  active,
  onClick,
  children,
  className = "rounded-lg px-4 py-3 text-sm",
}: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${className} font-bold ${active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
    >
      {children}
    </button>
  );
}

export function BookingsList({
  bookings,
  total,
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
            <Button type="button" onClick={onCreate} className="save-button">
              New Booking
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3 md:items-end justify-start w-full">
          <TextField
            label="Search"
            value={filters.query}
            onChange={(value: string) =>
              setFilters({ ...filters, query: value })
            }
            placeholder="Booking, patient, staff, status"
            className="search-input text-xs placeholder:text-xs"
          />
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
                  <td className="card-desc">{capitalizeFirst(patientName(patient))}</td>
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
    </Card>
  );
}

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
    .reduce((sum: number, row: any) => sum + Number(row.total_amount || 0), 0);
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
          {!locked && visitForm && (
            <form
              onSubmit={saveVisitLog}
              className="grid gap-3 rounded-xl bg-white p-3 md:grid-cols-4"
            >
              <DateField
                label="Service Date"
                value={visitForm.visit_date}
                onChange={(value: string) => setVisitField("visit_date", value)}
              />
              <FormField label="Staff Type">
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
                />
              </FormField>
              <FormField label="Staff Went">
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
                />
              </FormField>
              <FormField label="Status">
                <SearchableSelect
                  value={visitForm.status}
                  onChange={(value: string) => setVisitField("status", value)}
                  options={visitLogStatuses}
                  searchable={false}
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
                />
              ) : (
                <TextField
                  label="Service Name"
                  value={visitForm.description}
                  onChange={(value: string) =>
                    setVisitField("description", value)
                  }
                  placeholder="Type actual service done"
                  className="search-input"
                />
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
                  {!locked && <th className="pr-3 text-right">Actions</th>}
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
                      {money(row.total_amount)}
                    </td>
                    {!locked && (
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
    </div>
  );
}

export function InvoiceCard({
  booking,
  patientMap,
  invoiceDetail,
  discount,
  setDiscount,
  busy,
  onGenerate,
  onBack,
  onOpenInvoiceModule,
}: any) {
  if (!booking) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Select a booking to bill.</p>
        <div className="mt-4">
          <ActionButton onClick={onBack}>Back</ActionButton>
        </div>
      </Card>
    );
  }
  return (
    <Card className="mx-auto max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="card-title font-bold">Generate Invoice</h3>
          <p className="table-data text-slate-500">
            Bill the selected booking from its service lines.
          </p>
        </div>
        <Badge className="normal-badge">
          {humanizeOptionLabel(booking.status)}
        </Badge>
      </div>
      <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
        <b>{booking.booking_number}</b>
        <p className="mt-1 text-slate-500">
          {patientName(patientMap.get(booking.patient_id))} ·{" "}
          {displayDate(booking.start_date)} to {displayDate(booking.end_date)}
        </p>
        <p className="text-xs text-slate-500">
          {humanizeOptionLabel(booking.recurrence || "daily")}
        </p>
        <p className="mt-2 font-bold">{money(bookingTotal(booking))}</p>
      </div>
      {invoiceDetail?.invoice ? (
        <div className="mt-4 rounded-2xl border p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <b>{invoiceDetail.invoice.invoice_number}</b>
            <Badge className="normal-badge">
              {humanizeOptionLabel(invoiceDetail.invoice.status)}
            </Badge>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-slate-600">
            <span>Subtotal</span>
            <b className="text-right text-slate-900">
              {money(invoiceDetail.invoice.subtotal_amount)}
            </b>
            <span>Discount</span>
            <b className="text-right text-slate-900">
              {money(invoiceDetail.invoice.discount_amount)}
            </b>
            <span>Tax</span>
            <b className="text-right text-slate-900">
              {money(invoiceDetail.invoice.tax_amount)}
            </b>
            <span>Total</span>
            <b className="text-right text-slate-900">
              {money(invoiceDetail.invoice.total_amount)}
            </b>
            <span>Balance</span>
            <b className="text-right text-slate-900">
              {money(invoiceDetail.invoice.balance_amount)}
            </b>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Payment and receipt are handled from the Invoices module.
          </p>
          <div className="w-full flex justify-center">
            <Button
              type="button"
              className="w-1/2 rounded-lg px-2 py-2 mt-4 lg:px-4 lg:py-3 text-xs lg:text-sm"
              onClick={onOpenInvoiceModule}
            >
              Open in Invoices Module
            </Button>
          </div>
        </div>
      ) : String(booking.status).toLowerCase() === "cancelled" ? (
        <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
          This booking is cancelled. Invoices can no longer be generated for it.
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          <NumberField
            label="Discount"
            value={discount}
            onChange={setDiscount}
            min={0}
          />
          <Button type="button" disabled={busy} onClick={onGenerate}>
            {busy ? "Generating..." : "Generate Invoice"}
          </Button>
        </div>
      )}
      <div className="mt-4">
        <ActionButton onClick={onBack}>Back to Booking</ActionButton>
      </div>
    </Card>
  );
}

export function Info({ title, value }: any) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-[11px] font-bold uppercase text-slate-500">{title}</p>
      <p className="mt-1 break-words text-sm font-bold">{value}</p>
    </div>
  );
}
