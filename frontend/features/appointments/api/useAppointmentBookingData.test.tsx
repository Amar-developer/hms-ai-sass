// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import { useAppointmentBookingData } from "./useAppointmentBookingData";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const apiFetchMock = vi.mocked(apiFetch);
const apiSession = {
  email: "superadmin@medizinhub.test",
  tenantId: "platform-tenant",
  token: "token",
  user: { is_super_admin: true },
} as any;

describe("useAppointmentBookingData platform scope", () => {
  beforeEach(() => apiFetchMock.mockReset());

  it("waits for a tenant and always scopes the super-admin appointment request", async () => {
    let resolveTenants: (rows: any[]) => void = () => undefined;
    const tenantRequest = new Promise<any[]>((resolve) => {
      resolveTenants = resolve;
    });
    apiFetchMock.mockImplementation(async (path: string) => {
      const requestPath = String(path || "");
      if (requestPath === "/tenants") return tenantRequest;
      if (requestPath.startsWith("/billing/doctor-fee-rules")) return [];
      if (requestPath.startsWith("/appointments/platform/all?")) return [];
      return [];
    });

    const { result } = renderHook(() => {
      const [platformTenantId, setPlatformTenantId] = useState("");
      const data = useAppointmentBookingData({
        apiSession,
        isSuperAdmin: true,
        branchId: "",
        departmentId: "",
        appointmentDate: "2026-08-31",
        selectedDepartmentName: "",
        query: "",
        filterDate: "",
        platformTenantId,
        setPlatformTenantId,
        listRefreshKey: 0,
        setMessage: vi.fn(),
      });
      return { data, platformTenantId, setPlatformTenantId };
    });

    expect(
      apiFetchMock.mock.calls.some(([path]) =>
        String(path).startsWith("/appointments/platform/all?"),
      ),
    ).toBe(false);

    await act(async () => {
      resolveTenants([
        { id: "platform-tenant", name: "Platform", is_primary: true },
        { id: "clinic-1", name: "Clinic One", is_primary: false },
        { id: "clinic-2", name: "Clinic Two", is_primary: false },
      ]);
      await tenantRequest;
    });

    await waitFor(() => expect(result.current.platformTenantId).toBe("clinic-1"));
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\/appointments\/platform\/all\?limit=500&tenant_id=clinic-1$/,
        ),
        apiSession,
      ),
    );
    expect(result.current.data.platformTenants).toEqual([
      { id: "clinic-1", name: "Clinic One", is_primary: false },
      { id: "clinic-2", name: "Clinic Two", is_primary: false },
    ]);

    act(() => result.current.setPlatformTenantId("clinic-2"));
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.stringContaining("tenant_id=clinic-2"),
        apiSession,
      ),
    );
    expect(
      apiFetchMock.mock.calls
        .filter(([path]) =>
          String(path).startsWith("/appointments/platform/all?"),
        )
        .every(([path]) => String(path).includes("tenant_id=")),
    ).toBe(true);
  });
});
