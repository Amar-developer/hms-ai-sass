"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionButton,
  ActionGroup,
  Badge,
  Button,
  Card,
  RefreshButton,
  StatusToast,
} from "@/components/common/ui";
import {
  DateField,
  NumberField,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/FormElements";
import { apiFetch } from "@/lib/api";
import { searchPatients } from "@/lib/hmsLogic";
import { humanizeOptionLabel } from "@/lib/options";
import { displayDate } from "@/utils/helper";
import {
  emptyForm,
  emptyLine,
  recurrenceOptions,
  staffTypeOptions,
  statuses,
} from "@/utils/homecare/constants";
import {
  dayCount,
  isBookingLocked,
  mergeServices,
  money,
  patientCode,
  patientName,
  patientSearchLabel,
  recurrenceEndDate,
  serviceRowsFromResponse,
  today,
  userName,
  userTypeKey,
} from "@/utils/homecare/helpers";
import {
  BookingDetail,
  BookingsList,
  Header,
  InvoiceCard,
} from "@/components/homecare/Shared";

type View = "list" | "create" | "edit" | "view" | "invoice";

export function HomeCare({
  apiSession,
  branchId,
  patients = [],
  loadLiveData,
  setActive,
}: any) {
  const [view, setView] = useState<View>("list");
  const [bookings, setBookings] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<any>(null);
  const [invoiceDiscount, setInvoiceDiscount] = useState("0");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [serviceLoadError, setServiceLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [filters, setFilters] = useState({ query: "", status: "all" });
  const [patientSearch, setPatientSearch] = useState("");
  const [staffType, setStaffType] = useState("all");
  const [form, setForm] = useState<any>({ ...emptyForm });
  const [lineItems, setLineItems] = useState<any[]>([{ ...emptyLine }]);

  const patientMap = useMemo(
    () => new Map(patients.map((patient: any) => [patient.id, patient])),
    [patients],
  );
  const staffMap = useMemo(
    () => new Map(staff.map((user: any) => [user.id, user])),
    [staff],
  );
  const selectedPatient = patientMap.get(form.patient_id);
  const patientMatches = useMemo(() => {
    const query = patientSearch.trim().toLowerCase();
    if (!query || form.patient_id) return [];
    return searchPatients(patients, query).slice(0, 6);
  }, [form.patient_id, patientSearch, patients]);
  const normalizedStaffType =
    form.staff_type &&
    staffTypeOptions.some(([value]) => value === form.staff_type)
      ? form.staff_type
      : "custom";
  const filteredStaff = useMemo(
    () =>
      staff.filter(
        (user: any) =>
          staffType === "custom" || userTypeKey(user) === staffType,
      ),
    [staff, staffType],
  );
  const selected = bookings.find((row) => row.id === selectedId);
  const filteredBookings = useMemo(
    () =>
      bookings.filter((booking: any) => {
        const patient: any = patientMap.get(booking.patient_id);
        const assigned: any = staffMap.get(booking.assigned_staff_user_id);
        const haystack = [
          booking.booking_number,
          patientName(patient),
          patientCode(patient),
          patient?.mobile,
          patient?.alternate_mobile,
          patient?.guardian_name,
          patient?.guardian,
          patient?.guardian_mobile,
          patient?.guardianMobile,
          patient?.area,
          patient?.address,
          booking.assigned_staff_name || userName(assigned),
          booking.staff_type,
          booking.status,
          booking.complaints,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const query = filters.query.trim().toLowerCase();
        if (query && !haystack.includes(query)) return false;
        if (filters.status !== "all" && booking.status !== filters.status)
          return false;
        return true;
      }),
    [bookings, filters, patientMap, staffMap],
  );

  useEffect(() => {
    load();
  }, [apiSession?.token, apiSession?.tenantId, branchId]);
  useEffect(() => {
    if (selected?.id) loadInvoice(selected.id);
    else setInvoiceDetail(null);
  }, [selected?.id]);
  useEffect(() => {
    if (form.recurrence === "custom") return;
    setForm((prev: any) => ({
      ...prev,
      end_date: recurrenceEndDate(prev.start_date, prev.recurrence),
    }));
  }, [form.start_date, form.recurrence]);

  function setField(key: string, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  function selectPatient(patient: any) {
    setForm((prev: any) => ({ ...prev, patient_id: patient.id }));
    setPatientSearch(patientSearchLabel(patient));
  }

  function clearPatient() {
    setForm((prev: any) => ({ ...prev, patient_id: "" }));
    setPatientSearch("");
  }

  async function load() {
    if (!apiSession) return;
    setError("");
    setServiceLoadError("");
    try {
      const serviceRows = mergeServices(
        await apiFetch("/home-care/services", apiSession)
          .then(serviceRowsFromResponse)
          .catch((err: any) => {
            setServiceLoadError(err.message || "Unable to load services.");
            return [];
          }),
      );
      setServices(serviceRows);
      const [bookingRows, staffRows] = await Promise.all([
        apiFetch(`/home-care/bookings?branch_id=${branchId}`, apiSession).catch(
          (err: any) => {
            setError(err.message || "Unable to load home care bookings.");
            return [];
          },
        ),
        apiFetch("/identity/users", apiSession).catch(() => []),
      ]);
      setBookings(bookingRows);
      setStaff(staffRows.filter((user: any) => user.is_active !== false));
    } catch (err: any) {
      setError(err.message || "Unable to load home care bookings.");
    }
  }

  async function loadInvoice(bookingId: string) {
    if (!apiSession) return;
    setInvoiceDetail(null);
    try {
      setInvoiceDetail(
        await apiFetch(`/home-care/bookings/${bookingId}/invoice`, apiSession),
      );
    } catch {}
  }

  function setLine(index: number, key: string, value: any) {
    setLineItems((rows) =>
      rows.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, [key]: value };
        if (key === "service_id") {
          const service = services.find((item: any) => item.id === value);
          next.description = service?.name || "";
          next.unit_amount = String(service?.default_price || 0);
        }
        return next;
      }),
    );
  }

  function addLine() {
    setLineItems((rows) => [...rows, { ...emptyLine }]);
  }

  function removeLine(index: number) {
    setLineItems((rows) => rows.filter((_, i) => i !== index));
  }

  function payload() {
    return {
      branch_id: branchId,
      patient_id: form.patient_id,
      assigned_staff_user_id: form.assigned_staff_user_id || null,
      assigned_staff_name: form.assigned_staff_name || null,
      staff_type: form.staff_type || null,
      recurrence: form.recurrence,
      start_date: form.start_date || today,
      end_date: form.end_date || null,
      status: form.status,
      complaints: form.complaints || null,
      notes: form.notes || null,
      services: lineItems
        .filter((row) => row.service_id || row.description)
        .map((row) => ({
          service_id: row.service_id || null,
          description: row.description || null,
          quantity: Number(row.quantity || 1) * days,
          unit_amount: Number(row.unit_amount || 0),
        })),
    };
  }

  async function saveBooking(e: any) {
    e.preventDefault();
    if (!apiSession) return;
    setBusy("save");
    setMessage("");
    setError("");
    try {
      const saved = await apiFetch(
        editing ? `/home-care/bookings/${editing.id}` : "/home-care/bookings",
        apiSession,
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(payload()),
        },
      );
      await load();
      if (loadLiveData) await loadLiveData(apiSession);
      setSelectedId(saved.id);
      setMessage(
        editing ? "Home care booking updated." : "Home care booking created.",
      );
      setEditing(null);
      setView("view");
    } catch (err: any) {
      setError(err.message || "Unable to save home care booking.");
    } finally {
      setBusy("");
    }
  }

  function openCreate() {
    resetForm();
    setSelectedId("");
    setView("create");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openView(booking: any) {
    setSelectedId(booking.id);
    setView("view");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openInvoice(booking: any) {
    setSelectedId(booking.id);
    setInvoiceDiscount("0");
    setView("invoice");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToInvoiceModule(invoiceId: string) {
    if (!invoiceId) return;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("medizinhub.billingInvoiceId", invoiceId);
    }
    if (setActive) setActive("billing");
  }

  function startEdit(booking: any) {
    if (isBookingLocked(booking)) {
      setSelectedId(booking.id);
      setView("view");
      setError(
        `This booking is ${humanizeOptionLabel(booking.status)} and can no longer be edited.`,
      );
      return;
    }
    setEditing(booking);
    setSelectedId(booking.id);
    setForm({
      patient_id: booking.patient_id || "",
      assigned_staff_user_id: booking.assigned_staff_user_id || "",
      assigned_staff_name: booking.assigned_staff_name || "",
      staff_type: booking.staff_type || "nurse",
      recurrence: booking.recurrence || "daily",
      start_date: booking.start_date || today(),
      end_date: booking.end_date || "",
      status: booking.status || "requested",
      complaints: booking.complaints || "",
      notes: booking.notes || "",
    });
    setPatientSearch(patientSearchLabel(patientMap.get(booking.patient_id)));
    const assigned = staffMap.get(booking.assigned_staff_user_id);
    setStaffType(
      booking.staff_type || (assigned ? userTypeKey(assigned) : "custom"),
    );
    const bookingDays = dayCount(booking.start_date, booking.end_date);
    setLineItems(
      booking.services?.length
        ? booking.services.map((row: any) => ({
            service_id: row.service_id || "",
            description: row.description || "",
            quantity: String(
              Math.max(1, Math.round(Number(row.quantity || 1) / bookingDays)),
            ),
            unit_amount: String(row.unit_amount || 0),
          }))
        : [{ ...emptyLine }],
    );
    setView("edit");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditing(null);
    setForm({ ...emptyForm });
    setPatientSearch("");
    setStaffType("nurse");
    setLineItems([{ ...emptyLine }]);
  }

  function backToList() {
    setEditing(null);
    setView("list");
  }

  async function generateInvoice() {
    if (!apiSession || !selected) return;
    setBusy("invoice");
    setMessage("");
    setError("");
    try {
      const detail = await apiFetch(
        `/home-care/bookings/${selected.id}/invoice`,
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            discount_amount: Number(invoiceDiscount || 0),
            created_by_user_id: apiSession.user?.id,
          }),
        },
      );
      setInvoiceDetail(detail);
      await load();
      if (loadLiveData) await loadLiveData(apiSession);
      setMessage("Home care invoice generated.");
    } catch (err: any) {
      setError(err.message || "Unable to generate invoice.");
    } finally {
      setBusy("");
    }
  }

  const days = dayCount(form.start_date, form.end_date);
  const formLineTotal = lineItems.reduce(
    (sum, row) =>
      sum + Number(row.quantity || 0) * Number(row.unit_amount || 0) * days,
    0,
  );
  const isFormView = view === "create" || view === "edit";

  return (
    <div className="space-y-6">
      <Header
        view={view}
        count={bookings.length}
        onList={backToList}
        onCreate={openCreate}
      />
      <StatusToast
        message={message}
        tone="success"
        onClose={() => setMessage("")}
      />
      <StatusToast message={error} tone="error" onClose={() => setError("")} />

      {view === "list" && (
        <BookingsList
          bookings={filteredBookings}
          total={bookings.length}
          filters={filters}
          setFilters={setFilters}
          patientMap={patientMap}
          staffMap={staffMap}
          onRefresh={load}
          onCreate={openCreate}
          onView={openView}
          onEdit={startEdit}
          onInvoice={openInvoice}
        />
      )}

      {isFormView && (
        <Card>
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
            <div>
              <h3 className="card-title font-bold">
                {editing ? "Edit Booking" : "New Booking"}
              </h3>
              <p className="table-data text-slate-500">
                Patient-linked home care / visit booking with assigned staff,
                complaints, service lines, and schedule.
              </p>
            </div>
            <ActionButton onClick={backToList}>Back to list</ActionButton>
          </div>
          <form
            onSubmit={saveBooking}
            className="mt-5 grid gap-3 md:grid-cols-4"
          >
            <div className="relative md:col-span-2">
              <TextField
                label="Patient Search"
                value={patientSearch}
                onChange={(value) => {
                  setPatientSearch(value);
                  if (form.patient_id) {
                    setForm((prev: any) => ({ ...prev, patient_id: "" }));
                  }
                }}
                placeholder="Search patient name or mobile number"
                required={!form.patient_id}
                type="search"
                className="search-input"
              />
              {selectedPatient && (
                <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                  <span className="font-bold text-slate-700">
                    {patientSearchLabel(selectedPatient)}
                  </span>
                  <ActionButton onClick={clearPatient}>Change</ActionButton>
                </div>
              )}
              {patientMatches.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                  {patientMatches.map((patient: any) => (
                    <button
                      key={patient.id}
                      type="button"
                      onClick={() => selectPatient(patient)}
                      className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <b>{patientName(patient)}</b>
                      <p className="text-xs text-slate-500">
                        {patient.mobile || "-"} · {patientCode(patient) || "-"}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <SelectField
              label="Staff Type"
              value={normalizedStaffType}
              onChange={(value) => {
                setStaffType(value);
                setField("staff_type", value === "custom" ? "" : value);
                setField("assigned_staff_user_id", "");
              }}
              options={staffTypeOptions.map(([value, label]) => ({
                value,
                label,
              }))}
            />
            {normalizedStaffType === "custom" ? (
              <TextField
                label="Custom Staff Type"
                value={form.staff_type}
                onChange={(value) => {
                  setStaffType(value);
                  setField("staff_type", value);
                }}
                placeholder="Enter staff type"
              />
            ) : null}
            <div>
              <TextField
                label="Assigned Staff"
                value={form.assigned_staff_name}
                onChange={(value) => {
                  setField("assigned_staff_name", value);
                  setField("assigned_staff_user_id", "");
                }}
                placeholder="Type staff name manually"
                className="search-input"
              />
              {filteredStaff.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {filteredStaff.slice(0, 5).map((user: any) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        setField("assigned_staff_user_id", user.id);
                        setField("assigned_staff_name", userName(user));
                        setField("staff_type", userTypeKey(user));
                        setStaffType(userTypeKey(user));
                      }}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      {userName(user)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <SelectField
              label="Recurrence"
              value={form.recurrence}
              onChange={(value) => setField("recurrence", value)}
              options={recurrenceOptions.map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <DateField
              label="Start Date"
              value={form.start_date}
              onChange={(value) => setField("start_date", value)}
            />
            <DateField
              label="End Date"
              value={form.end_date}
              onChange={(value) => setField("end_date", value)}
              disabled={form.recurrence !== "custom"}
            />
            <SelectField
              label="Status"
              value={form.status}
              onChange={(value) => setField("status", value)}
              options={statuses.map(([value, label]) => ({ value, label }))}
            />
            <TextareaField
              label="Complaints"
              value={form.complaints}
              onChange={(value) => setField("complaints", value)}
              className="md:col-span-2"
            />
            <TextareaField
              label="Notes"
              value={form.notes}
              onChange={(value) => setField("notes", value)}
              className="md:col-span-2"
            />
            <div className="md:col-span-4 rounded-2xl bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase text-slate-500">
                  Services
                  <span className="ml-2 normal-case text-slate-400">
                    {serviceLoadError
                      ? serviceLoadError
                      : services.length
                        ? `${services.length} loaded: ${services
                            .slice(0, 3)
                            .map((service: any) => service.name)
                            .join(", ")}`
                        : "0 loaded"}
                  </span>
                </p>
                <ActionButton onClick={addLine}>Add Service</ActionButton>
              </div>
              <div className="space-y-3">
                {lineItems.map((line, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-xl bg-white p-3 md:grid-cols-[1.2fr_1.4fr_.55fr_.75fr_auto]"
                  >
                    <SelectField
                      label="Service"
                      value={line.service_id}
                      onChange={(value) => setLine(index, "service_id", value)}
                      options={[
                        { value: "", label: "Custom service" },
                        ...services.map((service: any) => ({
                          value: service.id,
                          label: `${service.name} · ${money(service.default_price)}/hr`,
                        })),
                      ]}
                    />
                    <div>
                      <TextField
                        label="Description"
                        value={line.description}
                        onChange={(value) =>
                          setLine(index, "description", value)
                        }
                        className="search-input"
                      />
                      <p className="mt-1 text-xs font-bold text-blue-600">
                        × {days} day{days > 1 ? "s" : ""} (
                        {displayDate(form.start_date)} →{" "}
                        {displayDate(form.end_date || form.start_date)})
                      </p>
                    </div>
                    <NumberField
                      label="Hours/Day"
                      value={line.quantity}
                      onChange={(value) => setLine(index, "quantity", value)}
                      min={1}
                    />
                    <NumberField
                      label="Hourly Rate"
                      value={line.unit_amount}
                      onChange={(value) => setLine(index, "unit_amount", value)}
                      min={0}
                    />
                    <div className="flex items-center">
                      <ActionButton
                        tone="danger"
                        onClick={() => removeLine(index)}
                        disabled={lineItems.length === 1}
                      >
                        Remove
                      </ActionButton>
                    </div>
                    <div className="text-right text-xs text-slate-500 md:col-span-5">
                      {Number(line.quantity || 0)} hr ×{" "}
                      {money(line.unit_amount)} × {days} day
                      {days > 1 ? "s" : ""} ={" "}
                      <b className="text-slate-700">
                        {money(
                          Number(line.quantity || 0) *
                            Number(line.unit_amount || 0) *
                            days,
                        )}
                      </b>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-end text-sm font-bold text-slate-700">
                Estimated total: {money(formLineTotal)}
              </div>
            </div>
            <div className="flex items-end gap-2 md:col-span-4">
              <Button disabled={busy === "save"}>
                {busy === "save"
                  ? "Saving..."
                  : editing
                    ? "Update Booking"
                    : "Create Booking"}
              </Button>
              <button onClick={backToList} className="close-button font-bold">
                Cancel
              </button>
            </div>
          </form>
        </Card>
      )}

      {view === "view" && (
        <BookingDetail
          booking={selected}
          patientMap={patientMap}
          staffMap={staffMap}
          invoiceDetail={invoiceDetail}
          onBack={backToList}
          onEdit={() => selected && startEdit(selected)}
          onInvoice={() => selected && openInvoice(selected)}
          onOpenInvoiceModule={() =>
            invoiceDetail?.invoice &&
            goToInvoiceModule(invoiceDetail.invoice.id)
          }
        />
      )}

      {view === "invoice" && (
        <InvoiceCard
          booking={selected}
          patientMap={patientMap}
          invoiceDetail={invoiceDetail}
          discount={invoiceDiscount}
          setDiscount={setInvoiceDiscount}
          busy={busy === "invoice"}
          onGenerate={generateInvoice}
          onBack={() => (selected ? openView(selected) : backToList())}
          onOpenInvoiceModule={() =>
            invoiceDetail?.invoice &&
            goToInvoiceModule(invoiceDetail.invoice.id)
          }
        />
      )}
    </div>
  );
}
