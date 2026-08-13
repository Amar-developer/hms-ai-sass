// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PermissionCheckboxes } from "./PermissionCheckboxes";

const catalog = [
  {
    key: "dashboard.read",
    module: "dashboard",
    module_label: "Dashboard / Overview",
    action: "read",
    description: "Dashboard / Overview Read",
  },
  {
    key: "practitioners.read",
    module: "practitioners",
    module_label: "Doctors & Practitioners",
    action: "read",
    description: "Doctors & Practitioners Read",
  },
  {
    key: "platform.tenants.manage",
    module: "platform.tenants",
    module_label: "Tenant Management",
    action: "manage",
    description: "Tenant Management Manage",
  },
  {
    key: "billing.refunds.approve",
    module: "billing.refunds",
    module_label: "Billing Refunds",
    action: "approve",
    description: "Billing Refunds Approve",
  },
  {
    key: "invoices.cancel_approve",
    module: "invoices",
    module_label: "Invoices & Receipts",
    action: "cancel_approve",
    description: "Invoices & Receipts Cancel Approve",
  },
];

describe("Super Admin permission catalog", () => {
  afterEach(cleanup);

  it("uses product module labels and updates the selected count", () => {
    render(
      <PermissionCheckboxes
        permissions={catalog}
        selected={["practitioners.read"]}
      />,
    );

    expect(screen.getByText("Doctors & Practitioners")).toBeTruthy();
    expect(screen.getByText("Dashboard / Overview")).toBeTruthy();
    expect(screen.getByText("Billing Refunds")).toBeTruthy();
    expect(screen.getAllByText("Module Type")).toHaveLength(2);
    expect(screen.queryByText("Document Type")).toBeNull();
    expect(screen.queryByText("Level")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Approve" })).toBeTruthy();
    expect(
      screen.getByRole("checkbox", { name: "Cancel Approve" }),
    ).toBeTruthy();
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.getByText(/Primary tenant scope/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "Manage" }));
    expect(screen.getByText("2 selected")).toBeTruthy();
  });

  it("resets controlled selections when a different role is displayed", async () => {
    const { rerender } = render(
      <PermissionCheckboxes
        permissions={catalog}
        selected={["practitioners.read"]}
      />,
    );

    rerender(
      <PermissionCheckboxes
        permissions={catalog}
        selected={["dashboard.read"]}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", { name: "Read", checked: true }),
      ).toBeTruthy();
      expect(screen.getByText("1 selected")).toBeTruthy();
    });
    const checked = screen
      .getAllByRole("checkbox")
      .filter((checkbox) => (checkbox as HTMLInputElement).checked);
    expect(checked).toHaveLength(1);
    expect((checked[0] as HTMLInputElement).value).toBe("dashboard.read");
  });

  it("identifies a customer-tenant catalog with no platform grants", () => {
    render(
      <PermissionCheckboxes permissions={catalog.slice(0, 2)} selected={[]} />,
    );

    expect(screen.getByText(/Customer tenant scope/i)).toBeTruthy();
  });

  it("can hide its heading when the page already provides one", () => {
    render(
      <PermissionCheckboxes
        permissions={catalog}
        selected={[]}
        showHeading={false}
      />,
    );

    expect(screen.queryByText("Role Permissions")).toBeNull();
  });

  it("lists all roles and switches the selected role", () => {
    const onRoleChange = vi.fn();
    render(
      <PermissionCheckboxes
        permissions={catalog}
        selected={[]}
        roleName="Doctor"
        roleId="role_doctor"
        roleOptions={[
          { id: "role_doctor", name: "Doctor", key: "doctor" },
          {
            id: "role_receptionist",
            name: "Receptionist",
            key: "receptionist",
          },
        ]}
        onRoleChange={onRoleChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Doctor" }));
    expect(
      screen.getAllByRole("button", { name: "Doctor" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Receptionist" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Receptionist" }));
    expect(onRoleChange).toHaveBeenCalledWith("role_receptionist");
  });
});
