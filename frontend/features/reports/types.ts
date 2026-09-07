export type AppointmentReportsProps = {
  openSections: any;
  setOpenSections: any;
  money: any;
  doctorRows: any;
  percent: any;
  onOpenInvoices: any;
};

export type FileColumn<T> = {
  key: keyof T | (string & {});
  header: React.ReactNode;
  width?: string;
  className?: string;
  cellClassName?: string;
  disableRowClick?: boolean;
  render?: (row: T, index: number) => React.ReactNode;
};

export type HomeCareReportsProps = {
  homeCareReportRows: any[];
  variant?: "combined" | "home_care" | "home_visit";
  openSections: any;
  setOpenSections: any;
  money: any;
  onOpenInvoices: any;
  loading?: boolean;
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
  invoiceDoctorFeeAmount: any;
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
  onOpenInvoices:any
  loading?: boolean;
};

export type LabReportsProps = {
  labSettlementRows: any;
  reportKind?: string;
  openSections: any;
  setOpenSections: any;
  money: any;
  onOpenInvoices: any;
  loading?: boolean;
};

export type MetrixProps = {
  totals: any;
  previousTotals: any;
  profitSummary: any;
  previousProfitSummary: any;
  grossProfit: number;
  finalProfit: number;
  previousFinalProfit: number;
  labSettlementSummary: any;
  membershipClaimRows: any[];
  trendRows: any[];
  loading?: boolean;
  error?: string;
  snapshots?: any[];
  recalculatingSnapshotId?: string | null;
  snapshotMessage?: string;
  onRecalculateSnapshot?: (snapshot: any) => void;
  chartPeriod: string;
  customStart: string;
  customEnd: string;
  onChartPeriodChange: (period: string) => void;
  onCustomRangeChange: (start: string, end: string) => void;
  money: (value: number) => string;
  percent: (value: number, total: number, fallbackTotal?: number) => string;
};

export type DashboardView = {
  totals: any;
  previousTotals: any;
  profitSummary: any;
  previousProfitSummary: any;
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
  onOpenInvoices: any;
  loading?: boolean;
};
