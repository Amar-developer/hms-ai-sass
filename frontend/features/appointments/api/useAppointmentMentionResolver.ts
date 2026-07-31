"use client";

import { useEffect } from "react";
import type { ApiSession } from "@/lib/api";
import { readNotificationTarget } from "@/lib/notificationTarget";
import * as appointmentsApi from "./appointments.api";

type UseAppointmentMentionResolverParams = {
  apiSession: ApiSession | null | undefined;
  patients: any[];
  setBooked: (value: any) => void;
  setSelectedPatient: (value: any) => void;
  setMode: (mode: "list" | "book") => void;
  setBookingStep: (step: "appointment" | "newPatient" | "success") => void;
  setQuery: (value: string) => void;
  setPage: (value: number) => void;
};

/**
 * Resolves the `medizinhub.notificationAppointmentId` handoff left by a
 * "you were mentioned" notification: opens straight to the booked-appointment
 * success view when the appointment can be fetched, otherwise falls back to
 * filtering the list view by that id.
 */
export function useAppointmentMentionResolver({
  apiSession,
  patients,
  setBooked,
  setSelectedPatient,
  setMode,
  setBookingStep,
  setQuery,
  setPage,
}: UseAppointmentMentionResolverParams) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mentionTarget = readNotificationTarget("appointment");
    const appointmentId = window.sessionStorage.getItem(
      "medizinhub.notificationAppointmentId",
    );
    if (!appointmentId) return;
    window.sessionStorage.removeItem("medizinhub.notificationAppointmentId");
    if (mentionTarget?.eventType === "comment.mentioned") {
      let active = true;
      appointmentsApi
        .fetchAppointment(apiSession as ApiSession, appointmentId)
        .then((appointment: any) => {
          if (!active) return;
          setBooked({ appointment, queue_entry: null });
          setSelectedPatient(
            patients.find(
              (patient: any) =>
                patient.id ===
                (appointment.patient_id || appointment.patientId),
            ) || null,
          );
          setMode("book");
          setBookingStep("success");
        })
        .catch(() => {
          if (!active) return;
          setMode("list");
          setQuery(appointmentId);
          setPage(1);
        });
      return () => {
        active = false;
      };
    }
    setMode("list");
    setQuery(appointmentId);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSession?.tenantId]);
}
