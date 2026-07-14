"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { humanizeOptionLabel } from "@/lib/options";
import { today } from "@/utils/helper";
import { emptyLine, homeCareHourPrices } from "./constants";
import {
  isBookingLocked,
  mergeServices,
  patientCode,
  serviceRowsFromResponse,
  userName,
} from "./helpers";
import { BookingsList } from "./components/BookingList";
import { InvoiceCard } from "./components/InvoiceCard";
import { BookingForm } from "@/features/home-care/forms/HomeCareForms";
import { BookingFormValues } from "@/features/home-care/homecare.schema";
import { patientName } from "@/utils/helper";
import { StatusToast } from "@/app/components/common/ui";
import { BookingDetail } from "./components/BookingDetail";
import { pageSize } from "@/utils/constants";

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
  const [page, setPage] = useState(1);
  const [lineItems, setLineItems] = useState<any[]>([{ ...emptyLine }]);
  const userPermissions = apiSession?.user?.permissions || [];
  const hasPermission = (...keys: string[]) =>
    Boolean(
      apiSession?.user?.is_super_admin ||
        userPermissions.includes("*") ||
        keys.some((key) => userPermissions.includes(key)),
    );
  // Editing and cancelling bookings is restricted to tenant admins (and super
  // admins), or any role explicitly granted home_care.edit/manage.
  const canManageBooking = Boolean(
    apiSession?.user?.is_super_admin ||
      apiSession?.user?.user_type === "tenant_admin" ||
      apiSession?.user?.roles?.includes("tenant_admin") ||
      hasPermission("home_care.edit", "home_care.manage"),
  );
  const canCreateBooking = hasPermission("home_care.create", "home_care.manage");
  const [visitForm, setVisitForm] = useState<any>(() => ({
    visit_date: today(),
    assigned_staff_user_id: "",
    assigned_staff_name: "",
    staff_type: "nurse",
    service_id: "",
    service_category: "home_care_service",
    description: "",
    quantity: "2",
    unit_amount: "500",
    status: "completed",
    notes: "",
  }));

  const patientMap = useMemo(
    () => new Map(patients.map((patient: any) => [patient.id, patient])),
    [patients],
  );
  const staffMap = useMemo(
    () => new Map(staff.map((user: any) => [user.id, user])),
    [staff],
  );
  const visitServices = useMemo(
    () =>
      services.filter((service: any) =>
        String(service.code || "")
          .toUpperCase()
          .startsWith("HV"),
      ),
    [services],
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
        const query = String(filters.query || "").trim().toLowerCase();
        if (query && !haystack.includes(query)) return false;
        if (filters.status !== "all" && booking.status !== filters.status)
          return false;
        return true;
      }),
    [bookings, filters, patientMap, staffMap],
  );
  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedBookings = filteredBookings.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  useEffect(() => {
    load();
  }, [apiSession?.tenantId, branchId]);
  useEffect(() => {
    setPage(1);
  }, [filters.query, filters.status]);
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);
  useEffect(() => {
    if (selected?.id) loadInvoice(selected.id);
    else setInvoiceDetail(null);
  }, [selected?.id]);
  useEffect(() => {
    if (!selected?.id) return;
    const firstService = selected.services?.[0];
    setVisitForm((prev: any) => ({
      ...prev,
      visit_date: selected.start_date || today(),
      ...(firstService
        ? {
            service_id:
              (firstService.service_category || "home_care_service") ===
              "home_visit_service"
                ? firstService.service_id || ""
                : "",
            service_category:
              firstService.service_category || "home_care_service",
            description: firstService.description || "",
            quantity:
              (firstService.service_category || "home_care_service") ===
              "home_visit_service"
                ? "1"
                : String(Math.max(1, Number(firstService.quantity || 2))),
            unit_amount: String(firstService.unit_amount || 0),
          }
        : {}),
    }));
  }, [selected?.id]);
  function setVisitField(key: string, value: any) {
    setVisitForm((prev: any) => {
      const next = { ...prev, [key]: value };
      if (key === "service_id") {
        const service = services.find((item: any) => item.id === value);
        const isVisitService = String(service?.code || "")
          .toUpperCase()
          .startsWith("HV");
        next.description = service?.name || "";
        next.unit_amount = String(service?.default_price || 0);
        next.service_category = isVisitService
          ? "home_visit_service"
          : "home_care_service";
        if (isVisitService) next.quantity = "1";
      }
      if (
        key === "quantity" &&
        next.service_category === "home_care_service" &&
        homeCareHourPrices[String(value)]
      ) {
        next.unit_amount = homeCareHourPrices[String(value)];
      }
      if (key === "staff_type") {
        next.assigned_staff_user_id = "";
        next.assigned_staff_name = "";
      }
      return next;
    });
  }

  async function createPatient(data: any) {
    if (!apiSession) return null;
    setBusy("patient");
    setError("");
    setMessage("");
    try {
      const saved = await apiFetch("/patients", apiSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: data.branchId || branchId,
          full_name: data.fullName,
          date_of_birth: data.dateOfBirth || null,
          gender: data.gender || "unknown",
          age_years: data.ageYears ? Number(data.ageYears) : null,
          mobile: data.mobile || null,
          alternate_mobile: data.alternateMobile || null,
          email: data.email || null,
          guardian_name: data.guardianName || null,
          guardian_mobile: data.guardianMobile || null,
          area: data.area || null,
          address: data.address || null,
          blood_group: data.bloodGroup || null,
        }),
      });
      const patient = {
        ...saved,
        full_name: saved.full_name || data.fullName,
        mobile: saved.mobile || data.mobile,
      };
      await loadLiveData?.(apiSession);
      setMessage("Patient created and selected.");
      return patient;
    } catch (err: any) {
      setError(err.message || "Unable to create patient.");
      return null;
    } finally {
      setBusy("");
    }
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

  async function handleSaveBooking(data: BookingFormValues) {
    if (!apiSession) return false;
    const serviceRows = lineItems.filter((row) => row.service_id || row.description);
    if (serviceRows.length === 0) {
      setError("At least one service is required.");
      return false;
    }
    if (data.status !== "requested") {
      setError("Create bookings as Requested, then assign staff before changing status.");
      return false;
    }
    if (
      data.booking_type === "home_visit" &&
      serviceRows.some((row) => !row.service_id)
    ) {
      setError("Select a configured home visit service for every visit line.");
      return false;
    }
    if (
      data.booking_type === "home_care" &&
      serviceRows.some((row) => !row.service_id && !String(row.description || "").trim())
    ) {
      setError("Enter a service name for every manual home care line.");
      return false;
    }
    setBusy("save");
    setMessage("");
    setError("");
    const isHomeVisit = data.booking_type === "home_visit";
    try {
      const saved = await apiFetch(
        editing ? `/home-care/bookings/${editing.id}` : "/home-care/bookings",
        apiSession,
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify({
            branch_id: branchId,
            patient_id: data.patient_id,
            booking_type: data.booking_type,
            location: data.location || null,
            recurrence: data.recurrence,
            start_date: data.start_date || today(),
            end_date: data.end_date || null,
            status: data.status,
            notes: data.notes || null,
            services: serviceRows
              .map((row) => ({
                service_id: row.service_id || null,
                service_category: isHomeVisit
                  ? "home_visit_service"
                  : "home_care_service",
                description: row.description || null,
                quantity: Number(row.quantity || 1),
                unit_amount: Number(row.unit_amount || 0),
              })),
          }),
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
      return true;
    } catch (err: any) {
      setError(err.message || "Unable to save home care booking.");
      return false;
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

  async function saveVisitLog(e: any) {
    e.preventDefault();
    if (!apiSession || !selected) return;
    const selectedIsHomeVisit =
      (selected.services || []).some(
        (row: any) => row.service_category === "home_visit_service",
      ) ||
      (selected.visit_logs || []).some(
        (row: any) => row.service_category === "home_visit_service",
      );
    setMessage("");
    setError("");
    if (!visitForm.visit_date) {
      setError("Service date is required.");
      return;
    }
    if (!visitForm.staff_type) {
      setError("Staff type is required.");
      return;
    }
    if (!visitForm.assigned_staff_user_id) {
      setError("Select which staff member went for the visit.");
      return;
    }
    if (!visitForm.status) {
      setError("Status is required.");
      return;
    }
    if (selectedIsHomeVisit && !visitForm.service_id) {
      setError("Select a visit service.");
      return;
    }
    if (!selectedIsHomeVisit && !String(visitForm.description || "").trim()) {
      setError("Enter the service name.");
      return;
    }
    if (!selectedIsHomeVisit && !Number(visitForm.quantity)) {
      setError("Hours is required.");
      return;
    }
    if (visitForm.unit_amount === "" || visitForm.unit_amount === null || visitForm.unit_amount === undefined) {
      setError("Price is required.");
      return;
    }
    setBusy("visit-log");
    try {
      await apiFetch(`/home-care/bookings/${selected.id}/visits`, apiSession, {
        method: "POST",
        body: JSON.stringify({
          visit_date: visitForm.visit_date || today(),
          assigned_staff_user_id: visitForm.assigned_staff_user_id || null,
          assigned_staff_name: visitForm.assigned_staff_name || null,
          staff_type: visitForm.staff_type || null,
          service_id: visitForm.service_id || null,
          service_category: selectedIsHomeVisit
            ? "home_visit_service"
            : "home_care_service",
          description: visitForm.description || null,
          quantity: Number(visitForm.quantity || 1),
          unit_amount: Number(visitForm.unit_amount || 0),
          status: visitForm.status || "completed",
          notes: visitForm.notes || null,
        }),
      });
      await load();
      setMessage("Actual service log saved.");
      setVisitForm((prev: any) => ({
        ...prev,
        visit_date: selected.start_date || today(),
        notes: "",
      }));
    } catch (err: any) {
      setError(err.message || "Unable to save actual service log.");
    } finally {
      setBusy("");
    }
  }

  async function deleteVisitLog(visitId: string) {
    if (!apiSession || !selected || !confirm("Delete this service log?"))
      return;
    setBusy(`delete-visit-${visitId}`);
    setMessage("");
    setError("");
    try {
      await apiFetch(
        `/home-care/bookings/${selected.id}/visits/${visitId}`,
        apiSession,
        { method: "DELETE" },
      );
      await load();
      setMessage("Actual service log deleted.");
    } catch (err: any) {
      setError(err.message || "Unable to delete actual service log.");
    } finally {
      setBusy("");
    }
  }

  async function cancelBooking() {
    if (!apiSession || !selected) return;
    if (
      !confirm("Cancel this booking? This will stop further edits and billing.")
    ) {
      return;
    }
    setBusy("cancel-booking");
    setMessage("");
    setError("");
    try {
      const saved = await apiFetch(
        `/home-care/bookings/${selected.id}`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "cancelled" }),
        },
      );
      await load();
      setSelectedId(saved.id);
      setMessage("Home care booking cancelled.");
    } catch (err: any) {
      setError(err.message || "Unable to cancel home care booking.");
    } finally {
      setBusy("");
    }
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
    setLineItems(
      booking.services?.length
        ? booking.services.map((row: any) => ({
            service_id: row.service_id || "",
            description: row.description || "",
            quantity: String(Math.max(1, Number(row.quantity || 1))),
            unit_amount: String(row.unit_amount || 0),
          }))
        : [{ ...emptyLine }],
    );
    setView("edit");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditing(null);
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

  const isFormView = view === "create" || view === "edit";

  return (
    <div className="space-y-6">
      {/* <Header
        view={view}
        count={bookings.length}
        onList={backToList}
        onCreate={openCreate}
      /> */}
      <StatusToast
        message={message}
        tone="success"
        onClose={() => setMessage("")}
      />
      <StatusToast message={error} onClose={() => setError("")} />

      {view === "list" && (
        <BookingsList
          bookings={pagedBookings}
          total={filteredBookings.length}
          page={safePage}
          totalPages={totalPages}
          onPage={setPage}
          filters={filters}
          setFilters={setFilters}
          patientMap={patientMap}
          staffMap={staffMap}
          onRefresh={load}
          onCreate={openCreate}
          onView={openView}
          onEdit={startEdit}
          onInvoice={openInvoice}
          canManage={canManageBooking}
          canCreate={canCreateBooking}
        />
      )}

      {isFormView && (
        <BookingForm
          patients={patients}
          services={services}
          visitServices={visitServices}
          serviceLoadError={serviceLoadError}
          editing={editing}
          branchId={branchId}
          busy={busy === "save"}
          patientCreateBusy={busy === "patient"}
          lineItems={lineItems}
          setLineItems={setLineItems}
          onCreatePatient={createPatient}
          onSubmit={handleSaveBooking}
          onCancel={backToList}
        />
      )}

      {view === "view" && (
        <BookingDetail
          booking={selected}
          patientMap={patientMap}
          staffMap={staffMap}
          staff={staff}
          services={services}
          visitForm={visitForm}
          setVisitField={setVisitField}
          saveVisitLog={saveVisitLog}
          deleteVisitLog={deleteVisitLog}
          busy={busy}
          invoiceDetail={invoiceDetail}
          onBack={backToList}
          onEdit={() => selected && startEdit(selected)}
          onCancel={cancelBooking}
          onInvoice={() => selected && openInvoice(selected)}
          canManage={canManageBooking}
          canCreateVisit={canCreateBooking}
          apiSession={apiSession}
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
