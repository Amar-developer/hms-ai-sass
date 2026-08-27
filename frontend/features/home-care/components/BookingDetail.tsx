import { displayDate, money, patientName } from "@/utils/helper";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import {
  bookingTotal,
  isBookingLocked,
  patientCode,
  userName,
  userTypeKey,
} from "../helpers";
import { humanizeOptionLabel } from "@/lib/options";
import { Info } from "@/app/components/common/Info";
import { ActivityLog } from "@/app/components/common/ActivityLog";
import {
  SearchableSelect,
  ActionButton,
  Button,
  Card,
  Input,
  Badge,
} from "@/app/components/common/ui";
import {
  editableBookingStatuses,
  homeCareHourPrices,
  staffTypeOptions,
  visitLogStatuses,
} from "../constants";
import {
  DateField,
  FormField,
  NumberField,
  TextareaField,
} from "@/app/components/FormElements";
import { homeCareHourOptions } from "../forms/HomeCareForms";
import { CopyIdButton } from "@/app/components/common/CopyIdButton";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  HeartPulse,
  ReceiptText,
} from "lucide-react";

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
  setConfirmAction,
  busy,
  invoiceDetail,
  onBack,
  onEdit,
  onCancel,
  onStatusChange,
  onInvoice,
  onOpenInvoiceModule,
  canManage = false,
  canCreateVisit = false,
  canCopyIds = false,
  apiSession,
}: any) {
  const [activeSection, setActiveSection] = useState("overview");
  useEffect(() => {
    setActiveSection("overview");
  }, [booking?.id]);
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
  const detailTabs = [
    { id: "overview", label: "Overview", icon: FileText },
    {
      id: "logs",
      label: "Service Logs",
      icon: ClipboardList,
      count: (booking.visit_logs || []).length,
    },
    { id: "billing", label: "Billing", icon: ReceiptText },
  ];
  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 px-4 py-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-brand">
              <HeartPulse className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-black tracking-tight text-slate-950">
                  Home Care / Visit Workspace
                </h2>
                <Badge
                  className="normal-label"
                  tone={String(
                    booking.status == "requested"
                      ? "orange"
                      : booking.status == "paid"
                        ? "green"
                        : booking.status == "invoiced"
                          ? "skyblue"
                          : booking.status == "scheduled"
                            ? "purple"
                            : booking.status == "in_progress"
                              ? "blue"
                              : booking.status == "cancelled"
                                ? "red"
                                : "slate",
                  )}
                >
                  {humanizeOptionLabel(booking.status)}
                </Badge>
              </div>
              <p className="text-xs font-medium text-slate-500">
                Patient services, visit logs and billing in one workspace
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-black text-slate-900">
                  {booking.booking_number}
                </span>
              <CopyIdButton
                value={booking.id}
                label="Home Care Booking ID"
                allowed={canCopyIds}
              />
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">
                  {booking.patient_name || patientName(patient)} ·{" "}
              {booking.patient_number ||
                patientCode(patient) ||
                patient?.mobile ||
                ""}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-end justify-end gap-2">
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
                <ButtonLoader loading={busy === "cancel-booking"}>
                  {busy === "cancel-booking"
                    ? "Cancelling..."
                    : "Cancel Booking"}
                </ButtonLoader>
              </ActionButton>
            )}
            {canManage && !locked ? (
              <div className="min-w-44">
                <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">
                  Booking Status
                </p>
                <SearchableSelect
                  value={booking.status}
                  onChange={onStatusChange}
                  options={editableBookingStatuses}
                  searchable={false}
                  disabled={busy === "booking-status"}
                  className="[&>button]:h-9"
                />
              </div>
            ) : null}
            <ActionButton onClick={onBack}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to list
            </ActionButton>
          </div>
        </div>
        <nav
          className="scrollbar-hidden flex gap-1 overflow-x-auto border-t border-slate-200 bg-slate-50 px-3 py-1.5"
          aria-label="Home care booking sections"
        >
          {detailTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setActiveSection(tab.id)}
                className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-bold transition-colors ${
                  active
                    ? "bg-brand text-brand-fg"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {Boolean(tab.count) && (
                  <span
                    className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] ${
                      active
                        ? "bg-white/20 text-brand-fg"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </section>
      <div>
        <section
          id="homecare-overview"
          className={activeSection === "overview" ? "block" : "hidden"}
        >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Info
            title="Patient"
            value={booking.patient_name || patientName(patient)}
          />
          <Info
            title="Recurrence"
            value={humanizeOptionLabel(booking.recurrence || "daily")}
          />
          <Info title="Start Date" value={displayDate(booking.start_date)} />
          <Info title="End Date" value={displayDate(booking.end_date)} />
          <Info title="Total" value={money(bookingTotal(booking))} />
          <Info title="Location" value={booking.location || "-"} />
        </div>
        {(booking.complaints || booking.notes) && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
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
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3">
            <p className="text-xs font-bold uppercase text-slate-500">
              Requested Services
            </p>
            <p className="text-xs text-slate-500">
              Requested dates: {displayDate(booking.start_date)} to{" "}
              {displayDate(booking.end_date || booking.start_date)}
            </p>
          </div>
          {(booking.services || []).length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500">
              No requested services recorded.
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {(booking.services || []).map((row: any, index: number) => (
                <div
                  key={row.id || `${row.description}-${index}`}
                  className="rounded-lg bg-slate-50 px-4 py-3 font-bold text-slate-900"
                >
                  {row.description || "Requested service"}
                </div>
              ))}
            </div>
          )}
        </div>
        </section>
        <section
          id="homecare-service-logs"
          className={activeSection === "logs" ? "block" : "hidden"}
        >
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="mb-3 flex flex-col justify-between gap-2 md:flex-row md:items-center">
            <div>
              <p className="card-title font-bold uppercase text-slate-900">
                Actual Service Logs
              </p>
              <p className="card-desc text-slate-500">
                Bill only completed visits. Missed or cancelled days stay
                tracked with zero amount.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue" className="normal-label">
                Billable total {money(actualTotal)}
              </Badge>
              {(invoiceDetail?.invoice ||
                String(booking.status).toLowerCase() !== "cancelled") && (
                <Button
                  type="button"
                  className="rounded-lg px-3 py-2 text-xs"
                  onClick={
                    invoiceDetail?.invoice ? onOpenInvoiceModule : onInvoice
                  }
                  disabled={
                    busy === "invoice" ||
                    (!invoiceDetail?.invoice && !hasBillableLog)
                  }
                  title={
                    !invoiceDetail?.invoice && !hasBillableLog
                      ? "Add at least one completed service log before generating an invoice"
                      : undefined
                  }
                >
                  <ButtonLoader loading={busy === "invoice"}>
                    {invoiceDetail?.invoice
                      ? "Go to Payment"
                      : busy === "invoice"
                        ? "Generating..."
                        : "Generate Invoice"}
                  </ButtonLoader>
                </Button>
              )}
            </div>
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
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold">
                  {isHomeVisitBooking
                    ? "Home Visit Service"
                    : "Home Care Service"}
                </div>
              </div>
              {fixedServiceCategory === "home_visit_service" ? (
                <FormField label="Visit Service">
                  <SearchableSelect
                    value={visitForm.service_id}
                    onChange={(value) => setVisitField("service_id", value)}
                    options={[
                      { value: "", label: "Select visit service" },
                      ...visitServices.map((service) => ({
                        value: service.id,
                        label: service.name,
                        sublabel: money(service.default_price),
                      })),
                    ]}
                    searchable={false}
                  />
                </FormField>
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
                <FormField label="Hours">
                  <SearchableSelect
                    searchable={false}
                    value={visitForm.quantity}
                    onChange={(value: string) =>
                      setVisitField("quantity", value)
                    }
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
                </FormField>
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
                inputClass="block min-h-[58px] resize-none"
              />
              <div className="flex h-full items-end">
                <Button
                  disabled={busy === "visit-log"}
                  className="save-button h-9 min-w-24 px-4 py-0"
                >
                  <ButtonLoader loading={busy === "visit-log"}>
                    {busy === "visit-log" ? "Saving..." : "Add Log"}
                  </ButtonLoader>
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
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">
                          {row.visit_number || row.id}
                        </span>
                        <CopyIdButton
                          value={row.id}
                          label="Home Visit ID"
                          allowed={canCopyIds}
                        />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {displayDate(row.visit_date)}
                      </p>
                    </td>
                    <td>
                      {row.assigned_staff_name ||
                        userName(staffMap.get(row.assigned_staff_user_id)) ||
                        "Not assigned"}
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
                          onClick={() =>
                            setConfirmAction({
                              kind: "delete",
                              entity: "serviceLog",
                              row: {
                                id: row.id,
                                name: row.service_name || "Log",
                              },
                            })
                          }
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
        </section>
      </div>
      <section
        id="homecare-billing"
        className={activeSection === "billing" ? "block" : "hidden"}
      >
      <Card className="p-0">
        <h3 className="text-base font-bold">Billing Summary</h3>
        {invoiceDetail?.invoice ? (
          <div className="mt-4 rounded-lg border p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <b>{invoiceDetail.invoice.invoice_number}</b>
                <CopyIdButton
                  value={invoiceDetail.invoice.id}
                  label="Invoice ID"
                  allowed={canCopyIds}
                />
              </div>
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
      </section>
      <ActivityLog
        resourceType="home_care_booking"
        resourceId={booking?.id}
        apiSession={apiSession}
      />
    </div>
  );
}
