import { describe, expect, it } from "vitest";

import { navigationModulesForPermissions } from "./permissionNavigation";

describe("navigationModulesForPermissions", () => {
  it("shows a module when the role has any action for that module", () => {
    const modules = navigationModulesForPermissions([
      "appointments.read",
      "patients.create",
      "pharmacy.dispense",
      "billing.refunds.request",
      "reports.export",
    ]);

    expect(modules).toEqual(
      expect.arrayContaining([
        "appointments",
        "patients",
        "pharmacy",
        "billing",
        "reports",
      ]),
    );
  });

  it("does not show modules without a matching permission", () => {
    const modules = navigationModulesForPermissions(["appointments.read"]);

    expect(modules).toContain("appointments");
    expect(modules).not.toContain("patients");
    expect(modules).not.toContain("lab");
    expect(modules).not.toContain("billing");
  });

  it("derives administration navigation from administration permissions", () => {
    const modules = navigationModulesForPermissions(["identity.roles.read"]);

    expect(modules).toEqual(expect.arrayContaining(["admin", "dashboard"]));
  });

  it("keeps the platform workspace exclusive to a super admin", () => {
    expect(
      navigationModulesForPermissions([], { isSuperAdmin: false }),
    ).not.toContain("superadmin");
    expect(
      navigationModulesForPermissions([], { isSuperAdmin: true }),
    ).toContain("superadmin");
  });
});
