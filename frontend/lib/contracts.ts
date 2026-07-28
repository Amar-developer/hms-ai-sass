export type PatientReference = {
  id: string;
  tenant_id?: string;
  branch_id?: string | null;
  patient_number?: string;
  full_name?: string;
  name?: string;
  mobile?: string | null;
  guardian_name?: string | null;
  guardian_mobile?: string | null;
  area?: string | null;
  address?: string | null;
  gender?: string;
  age_years?: number | null;
  status?: string;
  created_at?: string;
  updated_at?: string;
  active_alert_count?: number;
  critical_alert_count?: number;
  subscription_plan_name?: string | null;
  subscription_status?: string | null;
};

export type PatientDisplayFields = {
  patient_id: string;
  patient_name?: string | null;
  patient_number?: string | null;
};

export type LabOrderSummary = PatientDisplayFields & {
  id: string;
  tenant_id: string;
  branch_id: string;
  order_date: string;
  acquisition_source: string;
  referrer_patient_id?: string | null;
  referrer_name?: string | null;
  lab_order_number?: string | null;
  consultation_id?: string | null;
  source: string;
  status: string;
  priority: string;
  tests: string;
  notes?: string | null;
  external_referrer?: string | null;
  amount: number;
  ordered_by_user_id?: string | null;
  sample_collected_at?: string | null;
  result_ready_at?: string | null;
  cancelled_reason?: string | null;
  created_at: string;
  updated_at: string;
};

export type PharmacyIssueSummary = PatientDisplayFields & {
  id: string;
  tenant_id: string;
  branch_id: string;
  issue_number?: string | null;
  consultation_id?: string | null;
  source: string;
  status: string;
  medicine_text: string;
  notes?: string | null;
  external_prescriber?: string | null;
  amount: number;
  billing_invoice_id?: string | null;
  issued_by_user_id?: string | null;
  dispensed_by_user_id?: string | null;
  dispensed_at?: string | null;
  cancelled_reason?: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceSummary = PatientDisplayFields & {
  id: string;
  invoice_number: string;
  branch_id: string;
  status: string;
  subtotal_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  created_at: string;
  updated_at: string;
};
