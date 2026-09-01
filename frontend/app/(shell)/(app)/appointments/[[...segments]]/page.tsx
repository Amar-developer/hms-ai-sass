"use client";

import { redirect, useParams } from "next/navigation";

export default function AppointmentsPage() {
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];
  redirect(segments[0] === "new" ? "/opd/new" : "/opd/appointments");
}
