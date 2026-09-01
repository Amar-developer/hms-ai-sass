// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BookingDetail } from "./BookingDetail";

vi.mock("@/app/components/common/ActivityLog", () => ({
  ActivityLog: () => <div>Booking activity</div>,
}));

describe("home care booking workspace", () => {
  it("separates booking details into OPD-style tabs and keeps activity below", () => {
    const onOpenInvoiceModule = vi.fn();
    const booking = {
      id: "booking-1",
      booking_number: "MHB-HC-00001",
      patient_id: "patient-1",
      patient_name: "Amanath",
      patient_number: "MHB-PAT-00001",
      status: "requested",
      recurrence: "daily",
      start_date: "2026-08-26",
      end_date: "2026-08-27",
      location: "Anna Street",
      services: [
        {
          id: "service-1",
          description: "Walking",
          service_category: "home_care_service",
        },
      ],
      visit_logs: [
        {
          id: "visit-1",
          visit_number: "MHB-HCV-00001",
          visit_date: "2026-08-26",
          description: "Walking",
          service_category: "home_care_service",
          quantity: 2,
          unit_amount: 500,
          status: "completed",
        },
      ],
    };

    render(
      <BookingDetail
        booking={booking}
        patientMap={new Map()}
        staffMap={new Map()}
        staff={[]}
        services={[]}
        invoiceDetail={{
          invoice: {
            id: "invoice-1",
            invoice_number: "MHB-INV-00001",
            status: "paid",
            total_amount: 500,
            paid_amount: 500,
            balance_amount: 0,
          },
        }}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        onStatusChange={vi.fn()}
        onInvoice={vi.fn()}
        onOpenInvoiceModule={onOpenInvoiceModule}
        canManage
      />,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Home care booking sections",
    });
    for (const label of [
      "Overview",
      "Service Logs",
      "Billing",
    ]) {
      expect(
        within(navigation).getByRole("button", {
          name: new RegExp(`^${label}(?:\\s|$)`),
        }),
      ).toBeTruthy();
    }
    expect(
      within(navigation).queryByRole("button", { name: "Activity" }),
    ).toBeNull();
    expect(
      within(navigation).queryByRole("button", { name: /Requested Services/ }),
    ).toBeNull();
    expect(document.getElementById("homecare-overview")?.className).toContain(
      "block",
    );
    expect(screen.getByText("Requested Services")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel Booking" })).toBeTruthy();

    fireEvent.click(
      within(navigation).getByRole("button", { name: /^Service Logs/ }),
    );
    expect(
      document.getElementById("homecare-service-logs")?.className,
    ).toContain("block");
    expect(document.getElementById("homecare-overview")?.className).toContain(
      "hidden",
    );
    fireEvent.click(screen.getByRole("button", { name: "Go to Payment" }));
    expect(onOpenInvoiceModule).toHaveBeenCalledOnce();

    fireEvent.click(
      within(navigation).getByRole("button", { name: "Billing" }),
    );
    expect(document.getElementById("homecare-billing")?.className).toContain(
      "block",
    );
    expect(screen.getByText("Booking activity")).toBeTruthy();
  });
});
