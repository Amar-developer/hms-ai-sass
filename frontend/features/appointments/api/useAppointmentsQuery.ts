"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ApiSession } from "@/lib/api";
import { mapAppointment } from "@/lib/liveData";
import { usePractitionersQuery } from "@/features/doctors/api/usePractitionersQuery";
import {
  APPOINTMENT_ROWS_STALE_MS,
  CONSULTATION_ROWS_STALE_MS,
  QUEUE_ROWS_STALE_MS,
  SCHEDULE_ROWS_STALE_MS,
  appointmentRowsQueryKey,
  consultationRowsQueryKey,
  fetchAppointmentRows,
  fetchConsultationRows,
  fetchQueueRows,
  fetchScheduleRows,
  queueRowsQueryKey,
  scheduleRowsQueryKey,
} from "./appointmentWorkspaceQueries";

export function appointmentsQueryKey(apiSession: ApiSession | null | undefined) {
  return ["appointments", apiSession?.tenantId] as const;
}

type UseAppointmentsQueryOptions = {
  clinicId?: string;
  branchId?: string;
  patients?: any[];
};

/**
 * The shared, fully-mapped appointment list (appointment + queue +
 * consultation + schedule rows joined via `mapAppointment`), keyed by
 * tenant. Queue and Doctor Consultation read/write through this hook so a
 * queue transition or consultation action only refetches this one query
 * instead of the full shell preload. `scopedAppointments` mirrors the
 * shell's clinic/branch scoping so consumers get a shape matching `ctx`.
 */
export function useAppointmentsQuery(
  apiSession: ApiSession | null | undefined,
  { clinicId, branchId, patients = [] }: UseAppointmentsQueryOptions = {},
) {
  const queryClient = useQueryClient();
  const { livePractitioners } = usePractitionersQuery(apiSession);
  const queryKey = appointmentsQueryKey(apiSession);

  const query = useQuery<any[]>({
    queryKey,
    queryFn: async () => {
      const session = apiSession as ApiSession;
      const [appointmentRows, queueRows, consultationRows, scheduleRows] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: appointmentRowsQueryKey(session.tenantId),
          queryFn: () => fetchAppointmentRows(session),
          staleTime: APPOINTMENT_ROWS_STALE_MS,
        }),
        queryClient.fetchQuery({
          queryKey: queueRowsQueryKey(session.tenantId),
          queryFn: () => fetchQueueRows(session),
          staleTime: QUEUE_ROWS_STALE_MS,
        }),
        queryClient.fetchQuery({
          queryKey: consultationRowsQueryKey(session.tenantId),
          queryFn: () => fetchConsultationRows(session),
          staleTime: CONSULTATION_ROWS_STALE_MS,
        }),
        queryClient.fetchQuery({
          queryKey: scheduleRowsQueryKey(session.tenantId),
          queryFn: () => fetchScheduleRows(session),
          staleTime: SCHEDULE_ROWS_STALE_MS,
        }),
      ]);
      const patientMap = new Map(patients.map((p: any) => [p.id, p]));
      const practitionerMap = new Map(
        livePractitioners.map((p: any) => [p.id, p]),
      );
      return appointmentRows.map((row: any) =>
        mapAppointment(
          row,
          queueRows,
          consultationRows,
          patientMap,
          practitionerMap,
          session.tenantId,
          branchId || "",
          scheduleRows,
        ),
      );
    },
    enabled: Boolean(apiSession),
    // Queue and consultation consumers share this operational snapshot, but
    // it is intentionally short-lived because appointment state changes often.
    staleTime: 15_000,
  });

  // The network snapshot is shared by tenant, while patient/practitioner
  // references can arrive just after the query completes. Re-enrich the cached
  // rows from the current references so the UI never remains stuck showing an
  // internal id. This is local derivation and does not trigger another request.
  const appointments = useMemo(() => {
    const patientMap = new Map(patients.map((p: any) => [p.id, p]));
    const practitionerMap = new Map(
      livePractitioners.map((p: any) => [p.id, p]),
    );
    return (query.data ?? []).map((appointment: any) => {
      const patient = patientMap.get(
        appointment.patientId || appointment.patient_id,
      );
      const practitioner = practitionerMap.get(
        appointment.doctorId || appointment.practitioner_id,
      );
      return {
        ...appointment,
        patient:
          patient?.name || patient?.full_name || appointment.patient,
        patientMobile:
          patient?.mobile || appointment.patientMobile || "",
        doctor:
          practitioner?.full_name ||
          practitioner?.name ||
          appointment.doctor,
      };
    });
  }, [query.data, patients, livePractitioners]);
  const isSuperAdmin = Boolean(apiSession?.user?.is_super_admin);
  const scopedAppointments = appointments.filter((a: any) => {
    if (isSuperAdmin) return true;
    return a.clinicId === clinicId && (!branchId || a.branchId === branchId);
  });

  async function refetch() {
    const result = await query.refetch();
    return result.data ?? [];
  }

  function setLocal(updater: any[] | ((previous: any[]) => any[])) {
    queryClient.setQueryData(queryKey, (previous: any[] = []) =>
      typeof updater === "function"
        ? (updater as (previous: any[]) => any[])(previous)
        : updater,
    );
  }

  return {
    appointments,
    scopedAppointments,
    isLoading: query.isLoading,
    refetch,
    setLocal,
  };
}
