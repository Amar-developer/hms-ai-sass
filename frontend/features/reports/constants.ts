import { Activity, FileText, FlaskConical, Home, Receipt, Users } from "lucide-react";

export const reportSections = [
  ["metrix", "Metrics Report", Activity],
  ["invoice", "Invoice Report", Receipt],
  ["lab", "Lab Report", FlaskConical],
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
    "Membership Benefit",
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
    "Membership Benefit",
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
    "Membership Benefit",
    "Mode of Payment",
    "GST",
    "Purchase Cost",
    "Settlement %",
    "Pharmacy Profit",
  ];

  export const invoiceHeaders = [
      "Invoice",
      "Date",
      "Type",
      "Patient",
      "Doctor / Staff",
      "Status",
      "Total",
      "Paid Amount",
      "Balance",
      "Membership Benefit",
      "Mode of Payment",
      "GST from Paid",
      "Doctor Fee",
      "Settlement",
      "Settlement %",
      "Gross Profit",
      "Gross Profit %",
    ];
