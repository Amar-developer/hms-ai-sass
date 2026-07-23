export interface InvoiceLineItem {
  srNo: number | string;
  name: string;
  qty: number | string;
  mrp: number | string;
  discPercent?: number | string;
  rate: number | string;
}

export interface CustomerDetails {
  name?: string;
  phone?: string;
  whatsapp?: string;
  gstin?: string;
  address?: string;
  patientId?: string;
}

export interface BankDetails {
  name?: string;
  branch?: string;
  accountNumber?: string;
  ifsc?: string;
  upiId?: string;
  qrImageUrl?: string; // optional UPI QR code image
}

export interface CompanyDetails {
  name: string;
  tagline?: string;
  address: string;
  phone: string;
  gstin?: string;
  logoUrl?: string;
}

export interface InvoiceProps {
  company: CompanyDetails;
  invoiceNo: string;
  invoiceDate: string;
  customer: CustomerDetails;
  items: InvoiceLineItem[];
  bank?: BankDetails;
  terms?: string[];
  isPaid?: boolean;
  signatoryLine?: string; // e.g. "For MedizinHub Healthcare Service Pvt.Ltd"
  footerNote?: string;
  currencySymbol?: string;
  subTotal: number;
  discountAmount?: number;
  taxableAmount?: number;
  taxAmount?: number;
  taxLabel?: string;
  taxPercentage?: number;
  total: number;
  paidAmount?: number;
  balanceAmount?: number;
  tax_amount?: number;
}
