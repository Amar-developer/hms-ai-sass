import { Activity, FileText, FlaskConical, Home, Receipt, Users } from "lucide-react";

export const reportSections = [
  ["metrix", "Metrics Report", Activity],
  ["invoice", "Invoice Report", Receipt],
  ["lab", "Lab / Service Report", FlaskConical],
  ["appointments", "Appointments Report", FileText],
  ["pharmacy", "Pharmacy Report", Users],
  ["home_care", "Home Care / Visit Report", Home],
];

export const settlementHeaders = [
    "S.No",
    "Doctor",
    "Consultations",
    "Invoices",
    "Total",
    "Paid",
    "Due",
    "Payment",
    "Paid GST",
    "Doctor Fee",
    "Clinic Fee",
    "Final Profit",
    "Profit Margin",
  ];


   export const labSettlementHeaders = [
    "S.No",
    "Supplier",
    "Lab Test / Package",
    "Orders",
    "Invoices",
    "Total",
    "Paid",
    "Due",
    "Payment",
    "Paid GST",
    "Purchase",
    "Profit",
    "Margin",
  ];

    export const pharmacySettlementHeaders = [
    "S.No",
    "Supplier",
    "Medicine",
    "Issues",
    "Invoices",
    "Qty",
    "Total",
    "Paid",
    "Due",
    "Payment",
    "Paid GST",
    "Purchase",
    "Profit",
    "Margin",
  ];

  export const invoiceHeaders = [
      "S.No",
      "Invoice No.",
      "Date",
      "Type",
      "Patient",
      "Doctor / Staff",
      "Status",
      "Total",
      "Paid",
      "Due",
      "Payment",
      "Cost",
      "Paid GST",
      "Profit",
      "Margin",
    ];

export const homeCareHeaders = [
  "S.No",
  "Invoice No",
  "Date",
  "Type",
  "Patient",
  "Staff",
  "Total",
  "Paid",
  "Due",
  "Payment",
  "Paid GST",
  "Settlement",
  "Profit",
  "Margin",
];
