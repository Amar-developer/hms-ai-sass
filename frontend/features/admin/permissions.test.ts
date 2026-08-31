import { describe, expect, it } from "vitest";

import {
  canResetTenantUserPassword,
  canUseTenantAdminSection,
} from "./permissions";

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
    expect(
      canUseTenantAdminSection("whatsapp", {
        permissions: [
          "communications.read",
          "communications.whatsapp.manage",
        ],
      }),
    ).toBe(true);
    expect(
      canUseTenantAdminSection("whatsapp", {
        permissions: ["communications.whatsapp.manage"],
      }),
    ).toBe(false);
    expect(
      canUseTenantAdminSection("sms", {
        permissions: ["communications.read", "communications.sms.manage"],
      }),
    ).toBe(true);
    expect(
      canUseTenantAdminSection("sms", {
        permissions: ["communications.sms.manage"],
      }),
    ).toBe(false);
    expect(
      canUseTenantAdminSection("sms", {
        permissions: ["communications.read", "communications.whatsapp.manage"],
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

  it("allows password reset for super admin and tenant admin actors", () => {
    const tenantUser = {
      id: "user-1",
      tenant_id: "tenant-1",
      user_type: "staff",
      is_super_admin: false,
    };

    expect(
      canResetTenantUserPassword(
        {
          tenantId: "tenant-1",
          user: { id: "admin-1", is_super_admin: true },
        },
        tenantUser,
      ),
    ).toBe(true);
    expect(
      canResetTenantUserPassword(
        {
          tenantId: "tenant-1",
          user: { id: "admin-2", user_type: "tenant_admin" },
        },
        tenantUser,
      ),
    ).toBe(true);
    expect(
      canResetTenantUserPassword(
        {
          tenantId: "tenant-1",
          user: {
            id: "admin-3",
            permissions: ["identity.users.manage"],
            user_type: "staff",
          },
        },
        tenantUser,
      ),
    ).toBe(false);
  });
});
