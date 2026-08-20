// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { canCopyDatabaseIds, CopyIdButton } from "./CopyIdButton";

describe("CopyIdButton", () => {
  it("allows only tenant and super administrators", () => {
    expect(canCopyDatabaseIds({ user_type: "tenant_admin" })).toBe(true);
    expect(canCopyDatabaseIds({ is_super_admin: true })).toBe(true);
    expect(canCopyDatabaseIds({ roles: ["tenant_admin"] })).toBe(true);
    expect(canCopyDatabaseIds({ user_type: "receptionist" })).toBe(false);
    expect(canCopyDatabaseIds({ roles: ["doctor"] })).toBe(false);
  });

  it("does not render when copying is not allowed", () => {
    render(<CopyIdButton value="patient_abc123" label="Patient ID" />);
    expect(
      screen.queryByRole("button", { name: "Copy Patient ID" }),
    ).toBeNull();
  });

  it("copies the exact database ID", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const parentClick = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <div onClick={parentClick}>
        <CopyIdButton
          value="patient_abc123"
          label="Patient ID"
          allowed
        />
      </div>,
    );
    const button = screen.getByRole("button", { name: "Copy Patient ID" });
    expect(button.className).not.toContain("border");
    fireEvent.click(button);

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("patient_abc123"),
    );
    expect(
      screen.getByRole("button", { name: "Patient ID copied" }),
    ).toBeTruthy();
    expect(screen.queryByText("patient_abc123")).toBeNull();
    expect(parentClick).not.toHaveBeenCalled();
  });
});
