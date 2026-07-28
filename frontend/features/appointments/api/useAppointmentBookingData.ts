"use client";

import { useEffect, useState } from "react";
import { apiFetch, type ApiSession } from "@/lib/api";
import { activeTenantOptions, displayDate } from "@/utils/helper";

interface UseAppointmentBookingDataArgs {
  apiSession: ApiSession | null;
  isSuperAdmin: boolean;
  branchId: string;
  departmentId: string;
  appointmentDate: string;
  selectedDepartmentName: string;
  query: string;
  filterDate: string;
  platformTenantId: string;
  setPlatformTenantId: (value: string) => void;
  listRefreshKey: number;
  setMessage: (message: string) => void;
}

export function useAppointmentBookingData({
  apiSession,
  isSuperAdmin,
  branchId,
  departmentId,
  appointmentDate,
  selectedDepartmentName,
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
    async function loadPlatformGrid() {
      if (!apiSession || !isSuperAdmin) return;
      setPlatformLoading(true);
      try {
        const params = new URLSearchParams({ limit: "500" });
        if (query) params.set("q", query);
        if (filterDate) params.set("appointment_date", filterDate);
        if (platformTenantId) params.set("tenant_id", platformTenantId);
        const [tenantRows, appointmentRows] = await Promise.all([
          apiFetch("/tenants", apiSession),
          apiFetch(
            `/appointments/platform/all?${params.toString()}`,
            apiSession,
          ),
        ]);
        if (!alive) return;
        const selectableTenants = activeTenantOptions(tenantRows);
        const selectableTenantIds = new Set(
          selectableTenants.map((tenant: any) => tenant.id),
        );
        setPlatformTenants(selectableTenants);
        if (
          platformTenantId &&
          !selectableTenants.some(
            (tenant: any) => tenant.id === platformTenantId,
          )
        ) {
          setPlatformTenantId("");
        }
        setPlatformRows(
          appointmentRows.filter((row: any) =>
            selectableTenantIds.has(row.tenant_id),
          ),
        );
      } catch (err: any) {
        if (alive)
          setMessage(err.message || "Could not load all-tenant appointments.");
      } finally {
        if (alive) setPlatformLoading(false);
      }
    }
    loadPlatformGrid();
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
      if (!branchId || !departmentId || !appointmentDate) {
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
        const availabilityRows = await Promise.all(
          rows.map(async (row: any) => {
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
          }),
        );
        const availableRows = availabilityRows.filter(Boolean);
        if (!alive) return;
        setLiveDoctors(availableRows);
        setDoctorId((current) =>
          availableRows.some((row: any) => row.id === current)
            ? current
            : availableRows[0]?.id || "",
        );
        if (availableRows.length === 0) {
          setMessage(
            `No doctor is available for ${selectedDepartmentName} on ${displayDate(appointmentDate)}. Check doctor mapping and scheduling timings.`,
          );
        }
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
    selectedDepartmentName,
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
