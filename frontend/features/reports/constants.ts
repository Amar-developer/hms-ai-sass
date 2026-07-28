import { Activity, FileText, FlaskConical, Home, Receipt, Users } from "lucide-react";

export const reportSections = [
  ["metrix", "Metrics Report", Activity],
  ["invoice", "Invoice Report", Receipt],
  ["lab", "Lab / Service Report", FlaskConical],
  ["appointments", "Appointments Report", FileText],
  ["pharmacy", "Pharmacy Report", Users],
  ["home_care", "Home Care / Visit Report", Home],
];

export const defaultEmailReportSections = [
  "overall",
  "consultation",
  "lab",
  "service",
  "home_visit",
  "home_care",
  "pharmacy",
  "ip",
  "physiotherapy",
];

export const settlementHeaders = [
    "Doctor",
    "Consultations",
    "Invoices",
    "Gross Revenue",
    "Paid Revenue",
    "Balance",
    "Admin Approved Discount",
    "Offer Discount",
    "Membership Benefit",
    "Total Billing Discount",
    "Mode of Payment",
    "GST from Paid",
    "Doctor Fee",
    "Doctor Fee %",
    "Clinic Fee",
    "Profit %",
    "Final Profit",
  ];


   export const labSettlementHeaders = [
    "Supplier",
    "Lab Test / Package",
    "Orders",
    "Invoices",
    "Total",
    "Paid Revenue",
    "Balance",
    "Admin Approved Discount",
    "Offer Discount",
    "Membership Benefit",
    "Total Billing Discount",
    "Mode of Payment",
    "GST",
    "Purchase Cost",
    "Settlement %",
    "Lab Profit",
  ];

    export const pharmacySettlementHeaders = [
    "Supplier",
    "Medicine",
    "Issues",
    "Invoices",
    "Qty",
    "Total",
    "Paid Revenue",
    "Balance",
    "Admin Approved Discount",
    "Offer Discount",
    "Membership Benefit",
    "Total Billing Discount",
    "Mode of Payment",
    "GST",
    "Purchase Cost",
    "Settlement %",
    "Pharmacy Profit",
  ];

  export const invoiceHeaders = [
      "Invoice No.",
      "Invoice Date",
      "Invoice Type",
      "Patient",
      "Doctor / Staff",
      "Payment Status",
      "Total",
      "Paid",
      "Amount Due",
      "Admin Discount",
      "Offer Discount",
      "Membership Benefit",
      "Payment Method",
      "Paid GST",
      "Doctor Cost",
      "Settlement",
      "Realized Profit",
      "Profit Margin",
    ];
