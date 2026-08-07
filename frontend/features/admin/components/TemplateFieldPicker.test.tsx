// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TemplateFieldPicker } from "./TemplateFieldPicker";

const fields = [
  { key: "recipient_name", label: "Recipient name" },
  { key: "appointment_date", label: "Appointment date" },
  { key: "patient.date_of_birth", label: "Patient · Date of birth" },
  { key: "patient.blood_group", label: "Patient · Blood group" },
  { key: "doctor.primary_specialty", label: "Doctor · Specialty" },
];

describe("TemplateFieldPicker", () => {
  afterEach(cleanup);

  it("keeps the field list collapsed so selected values stay readable", () => {
    render(
      <TemplateFieldPicker
        fields={fields}
        selected={["recipient_name"]}
        onToggle={vi.fn()}
        max={10}
      />,
    );

    const [row] = screen.getAllByRole("listitem");
    expect(row.textContent).toContain("{{1}}");
    expect(row.textContent).toContain("Recipient name");
    expect(screen.queryByRole("button", { name: "Patient · Blood group" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    expect(screen.getByRole("button", { name: "Patient · Blood group" })).toBeTruthy();
  });

  it("groups fields by module instead of one flat wall of chips", () => {
    render(
      <TemplateFieldPicker
        fields={fields}
        selected={[]}
        onToggle={vi.fn()}
        max={10}
        defaultOpen
      />,
    );

    // Curated fields sort first under "Common", then one group per module.
    expect(screen.getByText("Common")).toBeTruthy();
    expect(screen.getByText("Patient")).toBeTruthy();
    expect(screen.getByText("Doctor")).toBeTruthy();

    // Inside a group the chip drops the redundant "Patient · " prefix, but the
    // accessible name keeps it so the field stays unambiguous.
    const chip = screen.getByRole("button", { name: "Patient · Date of birth" });
    expect(chip.textContent).toBe("Date of birth");
  });

  it("filters fields by search", () => {
    render(
      <TemplateFieldPicker
        fields={fields}
        selected={[]}
        onToggle={vi.fn()}
        max={10}
        defaultOpen
      />,
    );

    fireEvent.change(screen.getByLabelText("Search fields"), {
      target: { value: "blood" },
    });

    expect(screen.getByRole("button", { name: "Patient · Blood group" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Recipient name" })).toBeNull();
  });

  it("stops selection at the provider's parameter limit", () => {
    const onToggle = vi.fn();
    render(
      <TemplateFieldPicker
        fields={fields}
        selected={["recipient_name", "appointment_date"]}
        onToggle={onToggle}
        max={2}
        defaultOpen
      />,
    );

    expect(screen.getByText("2 of 2")).toBeTruthy();
    expect(screen.getByText(/Maximum 2 values reached/)).toBeTruthy();

    const unselected = screen.getByRole("button", {
      name: "Patient · Blood group",
    }) as HTMLButtonElement;
    expect(unselected.disabled).toBe(true);

    // An already-selected field stays clickable so it can be removed.
    fireEvent.click(screen.getByRole("button", { name: "Recipient name" }));
    expect(onToggle).toHaveBeenCalledWith("recipient_name");
  });

  it("renumbers placeholders from the selected order", () => {
    render(
      <TemplateFieldPicker
        fields={fields}
        selected={["appointment_date", "recipient_name"]}
        onToggle={vi.fn()}
        onMove={vi.fn()}
        max={10}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("{{1}}")).toBeTruthy();
    expect(rows[0].textContent).toContain("Appointment date");
    expect(within(rows[1]).getByText("{{2}}")).toBeTruthy();
    expect(rows[1].textContent).toContain("Recipient name");
  });

  it("prompts when nothing is selected yet", () => {
    render(
      <TemplateFieldPicker fields={fields} selected={[]} onToggle={vi.fn()} max={10} />,
    );

    expect(screen.getByText(/No fields selected yet/)).toBeTruthy();
    expect(screen.getByText("0 of 10")).toBeTruthy();
  });
});
