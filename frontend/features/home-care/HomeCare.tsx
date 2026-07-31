"use client";

import { useEffect, useMemo, useState } from "react";
import { readNotificationTarget } from "@/lib/notificationTarget";
import { humanizeOptionLabel } from "@/lib/options";
import { today } from "@/utils/helper";
import { emptyLine, homeCareHourPrices } from "./constants";
import { isBookingLocked, patientCode, userName } from "./helpers";
import { BookingsList } from "./components/BookingList";
import { InvoiceCard } from "./components/InvoiceCard";
import { BookingForm } from "@/features/home-care/forms/HomeCareForms";
import { BookingFormValues } from "@/features/home-care/homecare.schema";
import { patientName } from "@/utils/helper";
import { StatusToast } from "@/app/components/common/ui";
import { BookingDetail } from "./components/BookingDetail";
import { pageSize } from "@/utils/constants";
import { canCopyDatabaseIds } from "@/app/components/common/CopyIdButton";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { usePatientReferencesQuery } from "@/features/patients/api/usePatientReferencesQuery";
import {
  useHomeCareActions,
  useHomeCareBookingDetail,
  useHomeCareData,
} from "./api";

type View = "list" | "create" | "edit" | "view" | "invoice";

export function HomeCare({
  apiSession,
  branchId,
  loadLiveData,
  setActive,
}: any) {
  const canCopyIds = canCopyDatabaseIds(apiSession?.user);
  const [view, setView] = useState<View>("list");
  const { services, bookings, staff, loading, dataError, serviceLoadError, load } =
    useHomeCareData({ apiSession, branchId });
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [filters, setFilters] = useState({ query: "", status: "all" });
  const [page, setPage] = useState(1);
  const [lineItems, setLineItems] = useState<any[]>([{ ...emptyLine }]);
  const [confirmAction, setConfirmAction] = useState<any>(null);
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
  const canCreateBooking = hasPermission(
    "home_care.create",
    "home_care.manage",
  );
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

  const { patients, patientMap } = usePatientReferencesQuery(
    apiSession,
    bookings.map((booking: any) => booking.patient_id),
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
          booking.patient_name,
          booking.patient_number,
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
        const query = String(filters.query || "")
          .trim()
          .toLowerCase();
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

  const { invoiceDetail, setInvoiceDetail } = useHomeCareBookingDetail({
    apiSession,
    bookingId: selected?.id,
  });

  const {
    createPatient,
    handleSaveBooking,
    saveVisitLog,
    deleteVisitLog,
    cancelBooking,
    updateBookingStatus,
    generateInvoice,
  } = useHomeCareActions({
    apiSession,
    branchId,
    loadLiveData,
    selected,
    editing,
    setEditing,
    lineItems,
    visitForm,
    setVisitForm,
    setBusy,
    setError,
    setMessage,
    setSelectedId,
    setView,
    setInvoiceDetail,
    load,
  });

  useEffect(() => {
    const target = readNotificationTarget("home_care_booking");
    if (!target || !bookings.some((row: any) => row.id === target.resourceId))
      return;
    setSelectedId(target.resourceId);
    setView("view");
  }, [apiSession?.tenantId, bookings.length]);
  useEffect(() => {
    setPage(1);
  }, [filters.query, filters.status]);
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);
  useEffect(() => {
    if (dataError) setError(dataError);
  }, [dataError]);
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

  const isFormView = view === "create" || view === "edit";

  return (
    <div className="">
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
          loading={loading}
          onRefresh={load}
          onCreate={openCreate}
          onView={openView}
          onEdit={startEdit}
          onInvoice={openInvoice}
          canManage={canManageBooking}
          canCreate={canCreateBooking}
          canCopyIds={canCopyIds}
        />
      )}

      {isFormView && (
        <BookingForm
          apiSession={apiSession}
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
          setConfirmAction={setConfirmAction}
          busy={busy}
          invoiceDetail={invoiceDetail}
          onBack={backToList}
          onEdit={() => selected && startEdit(selected)}
          onCancel={cancelBooking}
          onStatusChange={updateBookingStatus}
          onInvoice={() => selected && openInvoice(selected)}
          canManage={canManageBooking}
          canCreateVisit={canCreateBooking}
          canCopyIds={canCopyIds}
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
          canCopyIds={canCopyIds}
          busy={busy === "invoice"}
          onGenerate={generateInvoice}
          onBack={() => (selected ? openView(selected) : backToList())}
          onOpenInvoiceModule={() =>
            invoiceDetail?.invoice &&
            goToInvoiceModule(invoiceDetail.invoice.id)
          }
        />
      )}

      {confirmAction && (
        <ConfirmModal
          action={confirmAction}
          busy={busy === `delete-visit-${confirmAction.row.id}`}
          onCancel={() => setConfirmAction(null)}
          onConfirm={async () => {
            await deleteVisitLog(confirmAction.row.id);
            setConfirmAction(null);
          }}
        />
      )}
    </div>
  );
}
