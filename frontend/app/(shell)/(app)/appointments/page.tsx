"use client";

import { AppointmentCalendarBooking } from "@/features/appointments/AppointmentCalendarBooking";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";

export default function AppointmentsPage() {
  const ctx = useWorkspace();
  const { navigatePage } = useShellChrome();
  return <AppointmentCalendarBooking {...ctx} setActive={navigatePage} />;
}
