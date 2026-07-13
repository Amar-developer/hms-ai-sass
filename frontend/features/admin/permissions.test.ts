import { describe, expect, it } from "vitest";

import { canUseTenantAdminSection } from "./permissions";

describe("tenant administration permission routing", () => {
  it("opens only the section granted to a custom role", () => {
    const user = { permissions: ["identity.users.read"] };

    expect(canUseTenantAdminSection("users", user)).toBe(true);
    expect(canUseTenantAdminSection("roles", user)).toBe(false);
    expect(canUseTenantAdminSection("settings", user)).toBe(false);
  });

  it("maps granular non-identity permissions to their section", () => {
    expect(
      canUseTenantAdminSection("membership", {
        permissions: ["patient_subscriptions.create"],
      }),
    ).toBe(true);
    expect(
      canUseTenantAdminSection("offers", {
        permissions: ["discounts.read"],
      }),
    ).toBe(true);
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
