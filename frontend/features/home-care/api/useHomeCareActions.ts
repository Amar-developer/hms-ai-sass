"use client";

import type { ApiSession } from "@/lib/api";
import { humanizeOptionLabel } from "@/lib/options";
import { today } from "@/utils/helper";
import { BookingFormValues } from "@/features/home-care/homecare.schema";
import * as homeCareApi from "./homecare.api";

type UseHomeCareActionsParams = {
  apiSession: ApiSession | null | undefined;
  branchId?: string;
  loadLiveData?: (session: ApiSession) => Promise<void>;
  selected: any;
  editing: any;
  lineItems: any[];
  visitForm: any;
  setVisitForm: (updater: (prev: any) => any) => void;
  setBusy: (value: string) => void;
  setError: (value: string) => void;
  setMessage: (value: string) => void;
  navigateToView: (id: string) => void;
  setInvoiceDetail: (value: any) => void;
  load: () => Promise<void>;
};

/**
 * Write actions for the home care dashboard: inline patient creation from
 * the booking form, creating/updating bookings, recording and deleting
 * actual service (visit) logs, cancelling a booking, changing its status,
 * and generating the booking invoice.
 */
export function useHomeCareActions({
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
  navigateToView,
  setInvoiceDetail,
  load,
}: UseHomeCareActionsParams) {
  async function createPatient(data: any) {
    if (!apiSession) return null;
    setBusy("patient");
    setError("");
    setMessage("");
    try {
      const saved: any = await homeCareApi.createHomeCarePatient(apiSession, {
        branch_id: data.branchId || branchId,
        full_name: data.fullName,
        date_of_birth: data.dateOfBirth || null,
        gender: data.gender || "unknown",
        age_years: data.ageYears ? Number(data.ageYears) : null,
        mobile: data.mobile || null,
        alternate_mobile: data.alternateMobile || null,
        guardian_name: data.guardianName || null,
        guardian_mobile: data.guardianMobile || null,
        email: data.email || null,
        area: data.area || null,
        address: data.address || null,
        blood_group: data.bloodGroup || null,
      });
      const patient = {
        ...saved,
        full_name: saved.full_name || data.fullName,
        mobile: saved.mobile || data.mobile,
        guardian_mobile: saved.guardian_mobile || data.guardianMobile,
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

  async function handleSaveBooking(data: BookingFormValues) {
    if (!apiSession) return false;
    const serviceRows = lineItems.filter(
      (row) => row.service_id || row.description,
    );
    if (serviceRows.length === 0) {
      setError("At least one service is required.");
      return false;
    }
    if (data.status !== "requested") {
      setError(
        "Create bookings as Requested, then assign staff before changing status.",
      );
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
      serviceRows.some(
        (row) => !row.service_id && !String(row.description || "").trim(),
      )
    ) {
      setError("Enter a service name for every manual home care line.");
      return false;
    }
    setBusy("save");
    setMessage("");
    setError("");
    const isHomeVisit = data.booking_type === "home_visit";
    try {
      const payload = {
        branch_id: branchId,
        patient_id: data.patient_id,
        booking_type: data.booking_type,
        location: data.location || null,
        recurrence: data.recurrence,
        visit_day_mode: data.visit_day_mode || "all",
        visit_weekdays: data.visit_weekdays || [],
        start_date: data.start_date || today(),
        end_date: data.end_date || null,
        status: data.status,
        notes: data.notes || null,
        services: serviceRows.map((row) => ({
          service_id: isHomeVisit ? row.service_id || null : null,
          service_category: isHomeVisit
            ? "home_visit_service"
            : "home_care_service",
          description: row.description || null,
          quantity: Number(row.quantity || 1),
          unit_amount: Number(row.unit_amount || 0),
        })),
      };
      const saved: any = editing
        ? await homeCareApi.updateBooking(apiSession, editing.id, payload)
        : await homeCareApi.createBooking(apiSession, payload);
      await load();
      if (loadLiveData) await loadLiveData(apiSession);
      setMessage(
        editing ? "Home care booking updated." : "Home care booking created.",
      );
      navigateToView(saved.id);
      return true;
    } catch (err: any) {
      setError(err.message || "Unable to save home care booking.");
      return false;
    } finally {
      setBusy("");
    }
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
    if (
      visitForm.unit_amount === "" ||
      visitForm.unit_amount === null ||
      visitForm.unit_amount === undefined
    ) {
      setError("Price is required.");
      return;
    }
    setBusy("visit-log");
    try {
      await homeCareApi.createVisitLog(apiSession, selected.id, {
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
    if (!apiSession || !selected) return;
    setBusy(`delete-visit-${visitId}`);
    setMessage("");
    setError("");
    try {
      await homeCareApi.deleteVisitLog(apiSession, selected.id, visitId);
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

    setBusy("cancel-booking");
    setMessage("");
    setError("");
    try {
      const saved: any = await homeCareApi.updateBooking(
        apiSession,
        selected.id,
        { status: "cancelled" },
      );
      await load();
      setMessage("Home care booking cancelled.");
    } catch (err: any) {
      setError(err.message || "Unable to cancel home care booking.");
    } finally {
      setBusy("");
    }
  }

  async function updateBookingStatus(status: string) {
    if (!apiSession || !selected || status === selected.status) return;
    setBusy("booking-status");
    setMessage("");
    setError("");
    try {
      const saved: any = await homeCareApi.updateBooking(
        apiSession,
        selected.id,
        { status },
      );
      await load();
      if (loadLiveData) await loadLiveData(apiSession);
      setMessage(
        `Booking status changed to ${humanizeOptionLabel(saved.status)}.`,
      );
    } catch (err: any) {
      setError(err.message || "Unable to update booking status.");
    } finally {
      setBusy("");
    }
  }

  async function generateInvoice() {
    if (!apiSession || !selected) return;
    setBusy("invoice");
    setMessage("");
    setError("");
    try {
      const detail = await homeCareApi.generateBookingInvoice(
        apiSession,
        selected.id,
        { created_by_user_id: apiSession.user?.id },
      );
      setInvoiceDetail(detail);
      await load();
      if (loadLiveData) await loadLiveData(apiSession);
      setMessage("Home care invoice generated.");
      return detail;
    } catch (err: any) {
      setError(err.message || "Unable to generate invoice.");
      return undefined;
    } finally {
      setBusy("");
    }
  }

  return {
    createPatient,
    handleSaveBooking,
    saveVisitLog,
    deleteVisitLog,
    cancelBooking,
    updateBookingStatus,
    generateInvoice,
  };
}
