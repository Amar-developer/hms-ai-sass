import { describe, expect, it } from "vitest";

import { canResetUserPassword } from "./helpers";

describe("super admin user helpers", () => {
  it("allows super admin to reset any non-super-admin user in the selected tenant", () => {
    const apiSession = {
      user: { id: "super-1", is_super_admin: true },
    };
    const selected = { id: "tenant-1", is_primary: false };

    expect(
      canResetUserPassword(
        apiSession,
        {
          id: "staff-1",
          tenant_id: "tenant-1",
          user_type: "staff",
          roles: ["staff"],
        },
        selected,
      ),
    ).toBe(true);
    expect(
      canResetUserPassword(
        apiSession,
        {
          id: "super-2",
          tenant_id: "tenant-1",
          user_type: "super_admin",
          is_super_admin: true,
          roles: ["super_admin"],
        },
        selected,
      ),
    ).toBe(false);
  });
});
