"use client";

import { useState } from "react";
import type { ApiSession } from "@/lib/api";
import { displayDate } from "@/utils/helper";
import * as appointmentsApi from "./appointments.api";

type UseAppointmentRescheduleParams = {
  apiSession: ApiSession | null | undefined;
  refreshAppointmentList: () => Promise<void>;
  setMessage: (message: string) => void;
};

export function useAppointmentReschedule({
  apiSession,
  refreshAppointmentList,
  setMessage,
}: UseAppointmentRescheduleParams) {
  const [rescheduleAppointment, setRescheduleAppointment] = useState<any>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  function openReschedule(appointment: any) {
    setRescheduleAppointment(appointment);
    setRescheduleDate(
      String(
        appointment.appointmentDate || appointment.appointment_date || "",
      ).slice(0, 10),
    );
    setMessage("");
  }

  async function saveReschedule() {
    if (!apiSession || !rescheduleAppointment?.id || !rescheduleDate) return;
    setRescheduleBusy(true);
    setMessage("");
    try {
      await appointmentsApi.rescheduleAppointment(
        apiSession,
        rescheduleAppointment.id,
        {
          appointment_date: rescheduleDate,
          appointment_time: null,
        },
      );
      setRescheduleAppointment(null);
      await refreshAppointmentList();
      setMessage(`Appointment rescheduled to ${displayDate(rescheduleDate)}.`);
    } catch (error: any) {
      setMessage(error?.message || "Could not reschedule appointment.");
    } finally {
      setRescheduleBusy(false);
    }
  }

  return {
    rescheduleAppointment,
    setRescheduleAppointment,
    rescheduleDate,
    setRescheduleDate,
    rescheduleBusy,
    openReschedule,
    saveReschedule,
  };
}
