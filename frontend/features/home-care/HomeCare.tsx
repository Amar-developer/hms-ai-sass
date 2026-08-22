"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readNotificationTarget } from "@/lib/notificationTarget";
import { humanizeOptionLabel } from "@/lib/options";
import { today } from "@/utils/helper";
import { newSegment, editSegment } from "@/lib/routeSlugs";
import { emptyLine, homeCareHourPrices } from "./constants";
import { bookingTotal, isBookingLocked, patientCode, userName } from "./helpers";
import { BookingsList } from "./components/BookingList";
import { InvoiceCard } from "./components/InvoiceCard";
import { BookingForm } from "@/features/home-care/forms/HomeCareForms";
import { patientName } from "@/utils/helper";
import { Input, RefreshButton, StatusToast } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
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
import { AdaptiveFilterTrigger } from "@/app/components/common/AdaptiveFilterTrigger";
import { AdaptiveSortTrigger } from "@/app/components/common/AdaptiveSortTrigger";
import { AdaptiveResultCount } from "@/app/components/common/AdaptiveResultCount";
import { BreadcrumbSlot } from "@/features/shell/AppShell";
import { getHomeCareTableSchema, getHomeCareQueryFields } from "./filterSchema";
import { sortRows } from "@/utils/sortRows";
import { applyQueryFilters, type QueryFilterRow } from "@/utils/queryFilter";
import type { SortState } from "@/utils/types";

type View = "list" | "create" | "edit" | "view" | "invoice";

export function HomeCare({
  apiSession,
  branchId,
  loadLiveData,
  setActive,
  view = "list",
  selectedId = "",
}: any) {
  const router = useRouter();
  const canCopyIds = canCopyDatabaseIds(apiSession?.user);
  // const [view, setView] = useState<View>("list");
  const {
    services,
    bookings,
    staff,
    loading,
    dataError,
    serviceLoadError,
    load,
  } = useHomeCareData({ apiSession, branchId });
  // const [selectedId, setSelectedId] = useState("");
  // const [editing, setEditing] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [filters, setFilters] = useState({
    query: "",
    fromDate: "",
    toDate: "",
  });
  const [sort, setSort] = useState<SortState | null>({
    key: "updated_at",
    dir: "desc",
  });
  const [queryFilters, setQueryFilters] = useState<QueryFilterRow[]>([]);
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
  const editing = view === "edit" ? selected : null;

  // Bounce back to the list if a direct/bookmarked view/edit/invoice link
  // no longer resolves to a real booking, but only once loading finished.
  useEffect(() => {
    if (
      (view !== "view" && view !== "edit" && view !== "invoice") ||
      !selectedId ||
      loading ||
      selected
    )
      return;
    router.replace("/home_care");
  }, [view, selectedId, loading, selected, router]);

  const homeCareQueryFields = useMemo(
    () => getHomeCareQueryFields({ rows: bookings }),
    [bookings],
  );
  const filteredBookings = useMemo(
    () =>
      sortRows(
        applyQueryFilters(
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
        const from = filters.fromDate
          ? new Date(filters.fromDate).getTime()
          : null;
        const to = filters.toDate
          ? new Date(`${filters.toDate}T23:59:59`).getTime()
          : null;
        const bookingStart = booking.start_date
          ? new Date(booking.start_date).getTime()
          : null;
        const bookingEnd = booking.end_date
          ? new Date(booking.end_date).getTime()
          : bookingStart;
        if (from !== null && bookingEnd !== null && bookingEnd < from)
          return false;
        if (to !== null && bookingStart !== null && bookingStart > to)
          return false;
        return true;
        }),
          homeCareQueryFields,
          queryFilters,
        ),
        sort,
        (booking, key) => {
          if (key === "patient")
            return (
              booking.patient_name || patientName(patientMap.get(booking.patient_id))
            );
          if (key === "date_range") return booking.start_date;
          if (key === "total") return bookingTotal(booking);
          return booking[key];
        },
      ),
    [bookings, filters, sort, patientMap, staffMap, homeCareQueryFields, queryFilters],
  );
  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedBookings = filteredBookings.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  const homeCareSchema = getHomeCareTableSchema();

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
    lineItems,
    visitForm,
    setVisitForm,
    setBusy,
    setError,
    setMessage,
    navigateToView: (id: string) => router.push(`/home_care/${id}`),
    setInvoiceDetail,
    load,
  });

  useEffect(() => {
    if (view !== "list") return;
    const target = readNotificationTarget("home_care_booking");
    if (!target || !bookings.some((row: any) => row.id === target.resourceId))
      return;
    router.push(`/home_care/${target.resourceId}`);
  }, [apiSession?.tenantId, bookings.length, view, router]);
  useEffect(() => {
    setPage(1);
  }, [filters.query, filters.fromDate, filters.toDate]);
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
    router.push(`/home_care/${newSegment("visit")}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openView(booking: any) {
    router.push(`/home_care/${booking.id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openInvoice(booking: any) {
    router.push(`/home_care/${booking.id}/invoice`);
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
      router.push(`/home_care/${booking.id}`);
      setError(
        `This booking is ${humanizeOptionLabel(booking.status)} and can no longer be edited.`,
      );
      return;
    }
    router.push(`/home_care/${booking.id}/${editSegment("visit")}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Populate the edit-form line items once per target booking, not on
  // every render — startEdit no longer does this directly since it (and
  // direct/bookmarked links) only navigate; this reacts to the URL. `editing`
  // is derived from an async-loaded list, so on a fresh mount (direct link)
  // it can still be undefined the first time this runs; the ref lets the
  // effect retry once the data actually arrives instead of only firing on
  // `view`/`selectedId`.
  const populatedEditBookingIdRef = useRef("");
  useEffect(() => {
    if (view !== "edit" || !selectedId) {
      populatedEditBookingIdRef.current = "";
      return;
    }
    if (!editing || populatedEditBookingIdRef.current === selectedId) return;
    populatedEditBookingIdRef.current = selectedId;
    setLineItems(
      editing.services?.length
        ? editing.services.map((row: any) => ({
            service_id: row.service_id || "",
            description: row.description || "",
            quantity: String(Math.max(1, Number(row.quantity || 1))),
            unit_amount: String(row.unit_amount || 0),
          }))
        : [{ ...emptyLine }],
    );
  }, [view, selectedId, editing]);

  function resetForm() {
    setLineItems([{ ...emptyLine }]);
  }

  function backToList() {
    router.push("/home_care");
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
        <BreadcrumbSlot>
          <div className="flex items-center gap-2">
            <AdaptiveResultCount
              shown={pagedBookings.length}
              total={filteredBookings.length}
              noun="bookings"
            />
            <RefreshButton
              onRefresh={load}
              className="h-auto rounded-md px-2.5 py-1 text-[11px]"
            />
            <AdaptiveFilterTrigger
              schema={homeCareSchema}
              query={filters.query}
              setQuery={(value: string) => setFilters({ ...filters, query: value })}
              filterValues={filters}
              onFilterChange={(key: string, value: string) =>
                setFilters({ ...filters, [key]: value })
              }
              sort={sort}
              onSortChange={setSort}
              showSort={false}
              onReset={() => {
                setFilters({ query: "", fromDate: "", toDate: "" });
                setSort(null);
              }}
              queryFields={homeCareQueryFields}
              queryFilters={queryFilters}
              onQueryFiltersChange={setQueryFilters}
            >
              <FormField label="From">
                <Input
                  type="date"
                  value={filters.fromDate}
                  onChange={(event: any) =>
                    setFilters({ ...filters, fromDate: event.target.value })
                  }
                />
              </FormField>
              <FormField label="To">
                <Input
                  type="date"
                  value={filters.toDate}
                  onChange={(event: any) =>
                    setFilters({ ...filters, toDate: event.target.value })
                  }
                />
              </FormField>
            </AdaptiveFilterTrigger>
            <AdaptiveSortTrigger
              fields={homeCareSchema.sortFields}
              sort={sort}
              onSortChange={setSort}
            />
          </div>
        </BreadcrumbSlot>
      )}

      {view === "list" && (
        <BookingsList
          bookings={pagedBookings}
          total={filteredBookings.length}
          page={safePage}
          totalPages={totalPages}
          onPage={setPage}
          sort={sort}
          onSortChange={setSort}
          patientMap={patientMap}
          staffMap={staffMap}
          loading={loading}
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
          onCancel={() =>
            setConfirmAction({
              type: "cancel-booking",
            })
          }
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
          action={{
            title:
              confirmAction.type === "cancel-booking"
                ? "Cancel Booking"
                : "Delete Visit",
            description:
              confirmAction.type === "cancel-booking"
                ? "Are you sure you want to cancel this booking? This action cannot be undone."
                : "Are you sure you want to delete this visit log?",
            confirmLabel:
              confirmAction.type === "cancel-booking"
                ? "Cancel Booking"
                : "Delete",
            confirmTone:
              confirmAction.type === "cancel-booking" ? "danger" : "danger",
            kind:
              confirmAction.type === "cancel-booking"
              ? "cancel Booking"
              : "delete log"
          }}
          busy={
            confirmAction.type === "cancel-booking"
              ? busy === "cancel-booking"
              : busy === `delete-visit-${confirmAction.row.id}`
          }
          onCancel={() => setConfirmAction(null)}
          onConfirm={async () => {
            if (confirmAction.type === "cancel-booking") {
              await cancelBooking();
            } else {
              await deleteVisitLog(confirmAction.row.id);
            }

            setConfirmAction(null);
          }}
        />
      )}
    </div>
  );
}
