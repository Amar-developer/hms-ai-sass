import { apiFetch, type ApiSession } from "@/lib/api";

export function listServices(session: ApiSession) {
  return apiFetch("/home-care/services", session);
}

export function listBookings(session: ApiSession, branchId: string) {
  return apiFetch(`/home-care/bookings?branch_id=${branchId}`, session);
}

export function listActiveUsers(session: ApiSession) {
  return apiFetch("/identity/users", session);
}

export function getBookingInvoice(session: ApiSession, bookingId: string) {
  return apiFetch(`/home-care/bookings/${bookingId}/invoice`, session);
}

export function createBooking(session: ApiSession, payload: any) {
  return apiFetch("/home-care/bookings", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateBooking(
  session: ApiSession,
  bookingId: string,
  payload: any,
) {
  return apiFetch(`/home-care/bookings/${bookingId}`, session, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createVisitLog(
  session: ApiSession,
  bookingId: string,
  payload: any,
) {
  return apiFetch(`/home-care/bookings/${bookingId}/visits`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteVisitLog(
  session: ApiSession,
  bookingId: string,
  visitId: string,
) {
  return apiFetch(`/home-care/bookings/${bookingId}/visits/${visitId}`, session, {
    method: "DELETE",
  });
}

export function generateBookingInvoice(
  session: ApiSession,
  bookingId: string,
  payload: any,
) {
  return apiFetch(`/home-care/bookings/${bookingId}/invoice`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createHomeCarePatient(session: ApiSession, payload: any) {
  return apiFetch("/patients", session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
