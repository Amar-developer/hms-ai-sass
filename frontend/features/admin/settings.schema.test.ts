import { describe, expect, it } from "vitest";

import { userSchema } from "./settings.schema";

const validUser = {
  name: "Front Desk User",
  username: "front.desk",
  email: "front.desk@example.test",
  userType: "receptionist" as const,
  mobile: "9876543210",
  branchId: "branch-1",
  password: "SecretPass123",
  mustChangePassword: "true",
  isActive: "true",
  roleKeys: ["receptionist"],
};

describe("userSchema username", () => {
  it("accepts a manually assigned login username", () => {
    expect(userSchema.safeParse(validUser).success).toBe(true);
  });

  it("rejects spaces and unsupported username characters", () => {
    const parsed = userSchema.safeParse({
      ...validUser,
      username: "Front Desk!",
    });
    expect(parsed.success).toBe(false);
  });
});
