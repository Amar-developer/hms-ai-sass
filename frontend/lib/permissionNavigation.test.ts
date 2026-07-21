import { describe, expect, it } from "vitest";

import { navigationModulesForPermissions } from "./permissionNavigation";

describe("navigationModulesForPermissions", () => {
  it("shows a module when any of its permissions are granted", () => {
    const modules = navigationModulesForPermissions([
      "appointments.read",
      "appointments.create",
      "patients.read",
      "patients.create",
      "pharmacy.read",
      "pharmacy.dispense",
      "billing.read",
      "billing.refunds.request",
      "reports.read",
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

  it("shows a module for a read-only role and hides unrelated modules", () => {
    const modules = navigationModulesForPermissions([
      "appointments.read",
      "patients.create",
    ]);

    expect(modules).toContain("appointments");
    expect(modules).toContain("patients");
    expect(modules).not.toContain("lab");
    expect(modules).not.toContain("billing");
  });

  it("derives administration navigation from administration permissions", () => {
    const modules = navigationModulesForPermissions([
      "identity.roles.read",
      "dashboard.read",
      "dashboard.access",
    ]);

    expect(modules).toContain("dashboard");
    expect(modules).toContain("admin");

    expect(
      navigationModulesForPermissions([
        "identity.roles.read",
        "identity.roles.edit",
      ]),
    ).toContain("admin");
  });

  it("controls dashboard explicitly instead of inheriting it from admin access", () => {
    expect(navigationModulesForPermissions(["dashboard.read"])).not.toContain(
      "dashboard",
    );
    expect(
      navigationModulesForPermissions([
        "dashboard.read",
        "dashboard.access",
      ]),
    ).toContain("dashboard");
    expect(
      navigationModulesForPermissions(["identity.roles.read"]),
    ).not.toContain("dashboard");
  });

  it("shows error logs only when its own permission is granted", () => {
    expect(
      navigationModulesForPermissions([
        "error_logs.read",
        "error_logs.manage",
      ]),
    ).toContain("error_logs");
    expect(
      navigationModulesForPermissions(["error_logs.read"]),
    ).toContain("error_logs");
    expect(
      navigationModulesForPermissions(["patients.read"]),
    ).not.toContain("error_logs");
  });

  it("keeps the platform workspace exclusive to a super admin", () => {
    expect(
      navigationModulesForPermissions([], { isSuperAdmin: false }),
    ).not.toContain("superadmin");
    expect(
      navigationModulesForPermissions([], { isSuperAdmin: true }),
    ).toContain("superadmin");
  });

  it("allows wildcard permission to open every module", () => {
    const modules = navigationModulesForPermissions(["*"]);

    expect(modules).toEqual(
      expect.arrayContaining(["dashboard", "appointments", "billing", "reports"]),
    );
  });
});
