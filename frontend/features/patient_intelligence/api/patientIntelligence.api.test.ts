import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api";
import {
  fetchIntelligenceDashboard,
  fetchIntelligenceSettings,
  queueRecommendedEngagementActions,
  updateManualLabSchedule,
} from "./patientIntelligence.api";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const apiFetchMock = vi.mocked(apiFetch);
const session = { tenantId: "tenant-1" } as any;

describe("Patient Intelligence API", () => {
  beforeEach(() => apiFetchMock.mockReset());

  it("maps dashboard filters to the backend contract", async () => {
    await fetchIntelligenceDashboard(session, {
      branchId: "branch-1",
      query: "Asha",
      flagKey: "REFILL_DUE",
      engagementStatus: "recommended",
      limit: 20,
      offset: 40,
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/patient-intelligence/dashboard?limit=20&offset=40&branch_id=branch-1&q=Asha&flag_key=REFILL_DUE&engagement_status=recommended",
      session,
    );
  });

  it("loads all settings resources in parallel", async () => {
    apiFetchMock
      .mockResolvedValueOnce([{ id: "rule-1" }])
      .mockResolvedValueOnce({ metrics: [] })
      .mockResolvedValueOnce([{ id: "content-1" }]);

    await expect(fetchIntelligenceSettings(session)).resolves.toEqual({
      rules: [{ id: "rule-1" }],
      configuration: { metrics: [] },
      content: [{ id: "content-1" }],
    });
  });

  it("sends bulk previews without reusing mutation idempotency keys", async () => {
    const payload = {
      flag_key: "REFILL_DUE",
      category: "lifecycle",
      limit: 500,
      dry_run: true,
    };
    await queueRecommendedEngagementActions(session, payload);
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/patient-intelligence/engagement-actions/bulk-queue",
      session,
      {
        method: "POST",
        body: JSON.stringify(payload),
        omitIdempotencyKey: true,
      },
    );
  });

  it("encodes patient ids for manual lab schedule updates", async () => {
    const payload = {
      expected_lab_on: "2026-09-01",
      lab_test_name: "HbA1c",
      notes: null,
    };
    await updateManualLabSchedule(session, "patient/1", payload);
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/patient-intelligence/patients/patient%2F1/manual-lab",
      session,
      { method: "PATCH", body: JSON.stringify(payload) },
    );
  });
});
