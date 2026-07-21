// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

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
});
