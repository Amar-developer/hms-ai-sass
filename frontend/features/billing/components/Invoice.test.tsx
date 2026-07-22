// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import Invoice from "./Invoice";

describe("invoice receipt columns", () => {
  afterEach(cleanup);

  it("omits expiry date and HSN/SAC from the item table", () => {
    render(
      <Invoice
        company={{
          name: "MedizinHub",
          address: "Chennai",
          phone: "9876543210",
        }}
        invoiceNo="MHB-INV-00054"
        invoiceDate="21/07/2026"
        customer={{ name: "Patient", address: "Anna Street" }}
        items={[
          {
            srNo: 1,
            name: "Bathing",
            qty: 1,
            mrp: 500,
            discPercent: 0,
            rate: 500,
          },
        ]}
        bank={{}}
        subTotal={500}
        total={500}
      />,
    );

    expect(screen.getByText("Name of Product / Service")).toBeTruthy();
    expect(screen.getByText("Qty")).toBeTruthy();
    expect(screen.getByText("MRP")).toBeTruthy();
    expect(screen.getByText("Rate")).toBeTruthy();
    expect(screen.queryByText("Exp. Date")).toBeNull();
    expect(screen.queryByText("HSN / SAC")).toBeNull();
  });

  it("shows prices and percentages as rounded whole values", () => {
    render(
      <Invoice
        company={{ name: "MedizinHub", address: "Chennai", phone: "9876543210" }}
        invoiceNo="MHB-INV-00055"
        invoiceDate="22/07/2026"
        customer={{ name: "Patient" }}
        items={[
          {
            srNo: 1,
            name: "Serum Creatinine",
            qty: 1,
            mrp: 180,
            discPercent: 10.57,
            rate: 161.46,
          },
        ]}
        bank={{}}
        subTotal={180}
        discountAmount={18.54}
        total={161.46}
      />,
    );

    expect(screen.getAllByText("₹180").length).toBeGreaterThan(0);
    expect(screen.getByText("11%")).toBeTruthy();
    expect(screen.getAllByText("₹161").length).toBeGreaterThan(0);
    expect(screen.getByText("-₹19")).toBeTruthy();
    expect(
      screen.getByText(/Rupees One Hundred Sixty One Only/),
    ).toBeTruthy();
  });
});
