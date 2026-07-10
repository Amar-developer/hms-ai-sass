export type AppointmentReportsProps = {
  openSections: any;
  setOpenSections: any;
  money: any;
  doctorRows: any;
  percent: any;
};

export type Column<T> = {
  key: keyof T | string;
  header: string;
  width?: string;
  className?: string;
  cellClassName?: string;
  render?: (row: T, index: number) => React.ReactNode;
  disableRowClick?: boolean;
};

export type DataTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  className?: string;
  onRowClick?: (row: T) => void;
};

export type HomeCareReportsProps = {
  homeCareReportRows: any[];
  openSections: any;
  setOpenSections: any;
  money: any;
};

export type InvoiceProps = {
  filteredInvoices: any;
  invoicePageRows: any;
  appointmentById: any;
  patientById: any;
  invoiceDoctorStaffName: any;
  invoicePaymentMode: any;
  invoiceGrossProfit: any;
  invoiceGrossProfitPercent: any;
  invoiceSettlementAmount: any;
  numberValue: any;
  doctorById: any;
  rowDate: any;
  invoiceTypeLabel: any;
  invoiceType: any;
  publicDisplayValue: any;
  humanizeOptionLabel: any;
  money: any;
  safeInvoicePage: any;
  total: any;
  pageSize: number;
  totalInvoicePages:any
  setInvoicePage:any
};

export type LabReportsProps = {
  labSettlementRows: any;
  openSections: any;
  setOpenSections: any;
  money: any;
};

export type MetrixProps = {
  totals: any;
  previousTotals: any;
  grossProfit: number;
  finalProfit: number;
  previousFinalProfit: number;
  labSettlementSummary: any;
  membershipClaimRows: any[];
  snapshots?: any[];
  recalculatingSnapshotId?: string | null;
  snapshotMessage?: string;
  onRecalculateSnapshot?: (snapshot: any) => void;
  money: (value: number) => string;
  percent: (value: number, total: number) => string;
};

export type DashboardView = {
  totals: any;
  previousTotals: any;
  grossProfit: number;
  finalProfit: number;
  previousFinalProfit: number;
  labSettlementSummary: any;
  membershipClaimRows: any[];
};


export type PharmacyReportsProps = {
  pharmacySettlementRows: any;
  openSections: any;
  setOpenSections: any;
  money: any;
};
