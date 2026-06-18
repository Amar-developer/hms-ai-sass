import { statuses } from "@/utils/homecare/constants";
import { Card,Badge,Button,RefreshButton,ActionButton,ActionGroup } from "../common/ui";
import { TextField,SelectField, NumberField } from "../FormElements";
import { bookingTotal, isBookingLocked, money, patientCode, patientName, userName } from "@/utils/homecare/helpers";
import { humanizeOptionLabel } from "@/lib/options";
import { displayDate } from "@/utils/helper";

export function Header({ view, count, onList, onCreate }: any) {
  const listActive =
    view === "list" || view === "view" || view === "edit" || view === "invoice";
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h3 className="text-2xl font-bold">Home Care / Visit Booking</h3>
        <p className="text-sm text-slate-500">
          Create patient-linked home care and visit bookings, assign staff, add
          complaints, service lines, and billing. {count} total bookings.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Tab active={listActive} onClick={onList}>
          Booked List
        </Tab>
        <Tab active={view === "create"} onClick={onCreate}>
          New Booking
        </Tab>
      </div>
    </div>
  );
}

export function Tab({ active, onClick, children }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-3 text-sm font-bold ${active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
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
}: any) {
  return (
    <Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-lg font-bold">Booked List</h3>
          <p className="text-sm text-slate-500">
            Track home care and visit requests, schedule ranges, assigned staff,
            and invoice state.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end lg:min-w-[640px]">
          <TextField
            label="Search"
            value={filters.query}
            onChange={(value: string) =>
              setFilters({ ...filters, query: value })
            }
            placeholder="Booking, patient, staff, status"
            className="search-input"
          />
          <SelectField
            label="Status"
            value={filters.status}
            onChange={(value: string) =>
              setFilters({ ...filters, status: value })
            }
            options={[
              { value: "all", label: "All statuses" },
              ...statuses.map(([value, label]) => ({ value, label })),
            ]}
          />
          <div className="flex items-end">
            <Button type="button" onClick={onCreate}>
              New Booking
            </Button>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <RefreshButton onRefresh={onRefresh} />
        <Badge tone="blue" className="normal-badge">{bookings.length} shown</Badge>
        <span className="text-xs text-slate-400">of {total} bookings</span>
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
              <th>Total</th>
              <th className="pr-4 text-right">Actions</th>
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
                    <b>{booking.booking_number}</b>
                    <p className="text-xs text-slate-500">
                      {booking.services?.length || 0} services
                    </p>
                  </td>
                  <td>{patientName(patient)}</td>
                  <td>
                    {booking.assigned_staff_name ||
                      userName(staffMap.get(booking.assigned_staff_user_id))}
                    {booking.staff_type && (
                      <p className="text-xs text-slate-500">
                        {humanizeOptionLabel(booking.staff_type)}
                      </p>
                    )}
                  </td>
                  <td>
                    {displayDate(booking.start_date)} to{" "}
                    {displayDate(booking.end_date)}
                    <p className="text-xs text-slate-500">
                      {humanizeOptionLabel(booking.recurrence || "daily")}
                    </p>
                  </td>
                  <td>
                    <Badge>{humanizeOptionLabel(booking.status)}</Badge>
                  </td>
                  <td>{money(bookingTotal(booking))}</td>
                  <td className="pr-4">
                    <ActionGroup>
                      <ActionButton onClick={() => onView(booking)}>
                        View
                      </ActionButton>
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
  invoiceDetail,
  onBack,
  onEdit,
  onInvoice,
  onOpenInvoiceModule,
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
  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_.9fr]">
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <h3 className="text-xl font-bold">{booking.booking_number}</h3>
            <p className="text-sm text-slate-500">
              {patientName(patient)} ·{" "}
              {patientCode(patient) || patient?.mobile || ""}
            </p>
          </div>
          <Badge>{humanizeOptionLabel(booking.status)}</Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Info
            title="Staff"
            value={
              booking.assigned_staff_name ||
              userName(staffMap.get(booking.assigned_staff_user_id))
            }
          />
          <Info
            title="Staff Type"
            value={humanizeOptionLabel(booking.staff_type || "-")}
          />
          <Info
            title="Recurrence"
            value={humanizeOptionLabel(booking.recurrence || "daily")}
          />
          <Info title="Start Date" value={displayDate(booking.start_date)} />
          <Info title="End Date" value={displayDate(booking.end_date)} />
          <Info title="Total" value={money(bookingTotal(booking))} />
        </div>
        {booking.complaints && (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
            <p className="text-xs font-bold uppercase text-slate-500">
              Complaints
            </p>
            <p className="mt-1 text-slate-700">{booking.complaints}</p>
          </div>
        )}
        {booking.notes && (
          <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm">
            <p className="text-xs font-bold uppercase text-slate-500">Notes</p>
            <p className="mt-1 text-slate-700">{booking.notes}</p>
          </div>
        )}
        <div className="mt-4 overflow-auto rounded-2xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Service</th>
                <th>Hours</th>
                <th>Rate</th>
                <th className="pr-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(booking.services || []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-slate-500">
                    No service lines.
                  </td>
                </tr>
              )}
              {(booking.services || []).map((row: any) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">{row.description}</td>
                  <td>{row.quantity}</td>
                  <td>{money(row.unit_amount)}</td>
                  <td className="pr-4 text-right">{money(row.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ActionButton onClick={onBack}>Back to list</ActionButton>
          <ActionButton
            onClick={onEdit}
            disabled={locked}
            title={locked ? "Locked after billing/completion" : undefined}
          >
            Edit
          </ActionButton>
          <Button
            type="button"
            onClick={invoiceDetail?.invoice ? onOpenInvoiceModule : onInvoice}
          >
            {invoiceDetail?.invoice ? "View Invoice" : "Generate Invoice"}
          </Button>
          {locked && (
            <span className="text-xs font-bold text-slate-400">
              🔒 {humanizeOptionLabel(booking.status)} — editing locked
            </span>
          )}
        </div>
      </Card>
      <Card>
        <h3 className="text-lg font-bold">Billing Summary</h3>
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
        <Badge className="normal-badge">{humanizeOptionLabel(booking.status)}</Badge>
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
            <Badge className="normal-badge">{humanizeOptionLabel(invoiceDetail.invoice.status)}</Badge>
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
          <Button
            type="button"
            className="w-full rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
            onClick={onOpenInvoiceModule}
          >
            Open in Invoices Module
          </Button>
        </div>
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
        <ActionButton onClick={onBack}>Back</ActionButton>
      </div>
    </Card>
  );
}

export function Info({ title, value }: any) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase text-slate-500">{title}</p>
      <p className="mt-1 break-words text-lg font-bold">{value}</p>
    </div>
  );
}
