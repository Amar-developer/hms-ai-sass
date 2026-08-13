export function opdAppointmentPath(appointmentId: unknown) {
  const id = String(appointmentId || "").trim();
  if (!id) return "/opd";
  return `/opd?${new URLSearchParams({ appointment: id }).toString()}`;
}
