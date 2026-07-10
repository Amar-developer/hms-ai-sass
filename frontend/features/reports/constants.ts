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
    "Doctor Fee",
    "Settlement",
    "Clinic Fee",
    "Gross Profit %",
    "Final Profit",
  ];


   export const labSettlementHeaders = [
    "Supplier",
    "Lab Test / Package",
    "Orders",
    "Invoices",
    "Revenue",
    "Purchase Cost",
    "Lab Profit",
  ];

    export const pharmacySettlementHeaders = [
    "Supplier",
    "Medicine",
    "Issues",
    "Invoices",
    "Qty",
    "Revenue",
    "Purchase Cost",
    "Pharmacy Profit",
  ];

  export const invoiceHeaders = [
      "Invoice",
      "Date",
      "Type",
      "Patient",
      "Doctor / Staff",
      "Status",
      "Paid Amount",
      "Mode of Payment",
      "Settlement",
      "Gross Profit",
      "Gross Profit %",
    ];
