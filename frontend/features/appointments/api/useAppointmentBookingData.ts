"use client";

import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { apiFetch, type ApiSession } from "@/lib/api";
import { mapWithConcurrency } from "@/lib/concurrency";
import { activeTenantOptions } from "@/utils/helper";

interface UseAppointmentBookingDataArgs {
  apiSession: ApiSession | null;
  isSuperAdmin: boolean;
  branchId: string;
  departmentId: string;
  appointmentDate: string;
  query: string;
  filterDate: string;
  platformTenantId: string;
  setPlatformTenantId: Dispatch<SetStateAction<string>>;
  listRefreshKey: number;
  setMessage: (message: string) => void;
}

export function useAppointmentBookingData({
  apiSession,
  isSuperAdmin,
  branchId,
  departmentId,
  appointmentDate,
  query,
  filterDate,
  platformTenantId,
  setPlatformTenantId,
  listRefreshKey,
  setMessage,
}: UseAppointmentBookingDataArgs) {
  const [liveDoctors, setLiveDoctors] = useState<any[]>([]);
  const [doctorFeeRules, setDoctorFeeRules] = useState<any[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [platformTenants, setPlatformTenants] = useState<any[]>([]);
  const [platformRows, setPlatformRows] = useState<any[]>([]);
  const [platformLoading, setPlatformLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    async function loadPlatformTenants() {
      if (!apiSession || !isSuperAdmin) {
        setPlatformTenants([]);
        return;
      }
      try {
        const tenantRows = await apiFetch("/tenants", apiSession);
        if (!alive) return;
        const selectableTenants = activeTenantOptions(tenantRows).filter(
          (tenant: any) => !tenant.is_primary,
        );
        setPlatformTenants(selectableTenants);
        setPlatformTenantId((current) => {
          if (selectableTenants.some((tenant: any) => tenant.id === current)) {
            return current;
          }
          return (
            selectableTenants.find(
              (tenant: any) => tenant.id === apiSession.tenantId,
            )?.id ||
            selectableTenants[0]?.id ||
            ""
          );
        });
      } catch (err: any) {
        if (alive) {
          setPlatformTenants([]);
          setPlatformTenantId("");
          setMessage(err.message || "Could not load tenant options.");
        }
      }
    }
    void loadPlatformTenants();
    return () => {
      alive = false;
    };
  }, [apiSession?.email, apiSession?.tenantId, isSuperAdmin]);

  useEffect(() => {
    let alive = true;
    async function loadPlatformGrid() {
      if (!apiSession || !isSuperAdmin || !platformTenantId) {
        setPlatformRows([]);
        setPlatformLoading(false);
        return;
      }
      setPlatformLoading(true);
      try {
        // The platform endpoint intentionally rejects an unscoped scan. A
        // tenant is therefore always present before this request is started.
        const params = new URLSearchParams({
          limit: "500",
          tenant_id: platformTenantId,
        });
        if (query) params.set("q", query);
        if (filterDate) params.set("appointment_date", filterDate);
        const appointmentRows = await apiFetch(
          `/appointments/platform/all?${params.toString()}`,
          apiSession,
        );
        if (!alive) return;
        setPlatformRows(
          appointmentRows.filter(
            (row: any) => row.tenant_id === platformTenantId,
          ),
        );
      } catch (err: any) {
        if (alive) {
          setPlatformRows([]);
          setMessage(err.message || "Could not load tenant appointments.");
        }
      } finally {
        if (alive) setPlatformLoading(false);
      }
    }
    void loadPlatformGrid();
    return () => {
      alive = false;
    };
  }, [
    apiSession?.email,
    apiSession?.tenantId,
    isSuperAdmin,
    query,
    filterDate,
    platformTenantId,
    listRefreshKey,
  ]);

  useEffect(() => {
    let alive = true;
    async function loadFeeRules() {
      if (!apiSession) {
        setDoctorFeeRules([]);
        return;
      }
      try {
        const params = branchId
          ? `?branch_id=${encodeURIComponent(branchId)}`
          : "";
        const rows = await apiFetch(
          `/billing/doctor-fee-rules${params}`,
          apiSession,
        );
        if (alive) setDoctorFeeRules(rows);
      } catch {
        if (alive) setDoctorFeeRules([]);
      }
    }
    loadFeeRules();
    return () => {
      alive = false;
    };
  }, [apiSession?.email, apiSession?.tenantId, branchId]);

  useEffect(() => {
    let alive = true;
    async function fetchDoctors(path: string) {
      try {
        return await apiFetch(path, apiSession as ApiSession);
      } catch (err: any) {
        if (
          String(err.message || "").includes("403") ||
          String(err.message || "")
            .toLowerCase()
            .includes("permission")
        ) {
          throw err;
        }
        return [];
      }
    }
    async function loadDoctors() {
      if (!apiSession) {
        setDoctorId("");
        return;
      }
      // "all" is a list filter, not a bookable department — asking the API for
      // its doctors returns nothing and makes the form look broken.
      if (
        !branchId ||
        !departmentId ||
        departmentId === "all" ||
        !appointmentDate
      ) {
        setLiveDoctors([]);
        setDoctorId("");
        return;
      }
      try {
        const params = new URLSearchParams({
          branch_id: branchId,
          department_id: departmentId,
        });
        const rows = await fetchDoctors(`/practitioners?${params.toString()}`);
        const availabilityRows = await mapWithConcurrency(
          rows,
          async (row: any) => {
            try {
              const calendarParams = new URLSearchParams({
                branch_id: branchId,
                department_id: departmentId,
                start_date: appointmentDate,
                end_date: appointmentDate,
              });
              const calendar = await apiFetch(
                `/practitioners/${row.id}/calendar?${calendarParams.toString()}`,
                apiSession,
              );
              const day = calendar?.days?.[0];
              const hasAvailableSlot =
                Number(day?.available_slots || 0) > 0 ||
                (day?.slots || []).some((slot: any) => slot.available);
              return hasAvailableSlot ? row : null;
            } catch {
              return null;
            }
          },
          4,
        );
        const availableRows = availabilityRows.filter(Boolean);
        if (!alive) return;
        setLiveDoctors(availableRows);
        setDoctorId((current) =>
          availableRows.some((row: any) => row.id === current)
            ? current
            : availableRows[0]?.id || "",
        );
        // An empty result is not an error: the booking form renders its own
        // inline "no doctor available" hint next to the doctor field, so a
        // toast here would fire on every tab switch that mounts this hook.
      } catch (err: any) {
        if (alive) {
          setLiveDoctors([]);
          setDoctorId("");
          setMessage(
            err.message ||
              "Your role cannot read doctors for appointment booking. Enable Appointments Create or Doctors Read permission for this role.",
          );
        }
      }
    }
    loadDoctors();
    return () => {
      alive = false;
    };
  }, [
    apiSession?.email,
    apiSession?.tenantId,
    branchId,
    departmentId,
    appointmentDate,
  ]);

  return {
    liveDoctors,
    doctorFeeRules,
    doctorId,
    setDoctorId,
    platformTenants,
    platformRows,
    platformLoading,
  };
}
