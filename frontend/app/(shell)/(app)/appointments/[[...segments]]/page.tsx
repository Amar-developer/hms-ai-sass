"use client";

import { useParams } from "next/navigation";
import { AppointmentCalendarBooking } from "@/features/appointments/AppointmentCalendarBooking";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";

export default function AppointmentsPage() {
  const ctx = useWorkspace();
  const { navigatePage } = useShellChrome();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];
  const mode = segments[0] === "new" ? "book" : "list";
  return (
    <AppointmentCalendarBooking
      {...ctx}
      setActive={navigatePage}
      mode={mode}
    />
  );
}
