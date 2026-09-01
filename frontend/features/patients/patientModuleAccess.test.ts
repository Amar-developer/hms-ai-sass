import { describe, expect, it } from "vitest";

import type { ApiSession } from "@/lib/api";
import { canReadPatientLinkedModule } from "./patientModuleAccess";

function session(permissions: string[] = []): ApiSession {
  return {
    tenantId: "tenant-one",
    email: "user@example.test",
    user: { permissions },
  };
}

describe("patient linked-module access", () => {
  it("does not load modules excluded by the subscription", () => {
    const current = session(["ip.read", "physiotherapy.read"]);
    const enabledModules = ["patients", "lab"];

    expect(canReadPatientLinkedModule(current, enabledModules, "ip")).toBe(false);
    expect(
      canReadPatientLinkedModule(current, enabledModules, "physiotherapy"),
    ).toBe(false);
  });

  it("requires both entitlement and read permission", () => {
    expect(canReadPatientLinkedModule(session(), ["ip"], "ip")).toBe(false);
    expect(
      canReadPatientLinkedModule(session(["ip.read"]), ["ip"], "ip"),
    ).toBe(true);
  });

  it("honors tenant-admin implicit tenant permissions", () => {
    const current = session();
    current.user.user_type = "tenant_admin";
    expect(
      canReadPatientLinkedModule(current, ["physiotherapy"], "physiotherapy"),
    ).toBe(true);
  });
});
