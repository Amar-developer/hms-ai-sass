import { describe, expect, it } from "vitest";

import { canUseTenantAdminSection } from "./permissions";

describe("tenant administration permission routing", () => {
  it("requires read plus another action for a custom-role section", () => {
    const readOnly = { permissions: ["identity.users.read"] };
    const readAndEdit = {
      permissions: ["identity.users.read", "identity.users.edit"],
    };

    expect(canUseTenantAdminSection("users", readOnly)).toBe(false);
    expect(canUseTenantAdminSection("users", readAndEdit)).toBe(true);
    expect(canUseTenantAdminSection("roles", readAndEdit)).toBe(false);
    expect(canUseTenantAdminSection("settings", readAndEdit)).toBe(false);
  });

  it("maps granular non-identity permissions to their section", () => {
    expect(
      canUseTenantAdminSection("membership", {
        permissions: [
          "patient_subscriptions.read",
          "patient_subscriptions.create",
        ],
      }),
    ).toBe(true);
    expect(
      canUseTenantAdminSection("offers", {
        permissions: ["discounts.read", "discounts.edit"],
      }),
    ).toBe(true);
    expect(
      canUseTenantAdminSection("offers", {
        permissions: ["discounts.read"],
      }),
    ).toBe(false);
  });

  it("keeps tenant admins and wildcard users fully authorized", () => {
    expect(
      canUseTenantAdminSection("settings", { roles: ["tenant_admin"] }),
    ).toBe(true);
    expect(
      canUseTenantAdminSection("roles", { permissions: ["*"] }),
    ).toBe(true);
  });
});
