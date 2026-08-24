export type Column = {
  label: string;
  width: string;
};


export type NoticeTone = "success" | "warning" | "delete" | "info" | "error";

export type SearchableOption = {
  value: string;
  label: string;
  sublabel?: string;
  badges?: Array<{
    label: string;
    title?: string;
    className?: string;
    style?: React.CSSProperties;
  }>;
};

export type SearchableSelectProps<T = string> = {
  name?: string;
  value?: T;
  onChange?: (value: T) => void;
  options: SearchableOption[];
  placeholder?: string;
  disabled?: boolean;
  allowCustom?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  maxOptions?: number;
  className?: string;
  text?:string;
  searchable?: boolean;
  required?: boolean;
  error?: string;
  loading?: boolean;
  onSearchChange?: (query: string) => void;
  autoOpen?: boolean;
};


export type Action = {
  label: string;
  onClick: () => void;
  hidden?: boolean;
  disabled?: boolean;
  danger?: boolean;
};

export type RowActionsProps = {
  actions: Action[];
  className?: string;
  width?: string;
  portal?: boolean;
};

export type Role = {
  id: string;
  name: string;
  key: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};


export type File = {
  id: string;
  file_name: string;
  category: string;
  attached_to_doctype: string;
  patient_id: string;
  created_at: string;
  file_url: string;
};


export type WhatsAppFlowKey =
  | "appointment_booked_patient"
  | "appointment_booked_doctor"
  | "invoice_paid_patient"
  | "payment_pending_patient"
  | "appointment_cancelled_patient"
  | "appointment_cancelled_doctor"
  | "invoice_refunded_patient"
  | "lab_report_ready_patient"
  | "prescription_ready_patient"
  | "follow_up_advice_patient"
  | "appointment_reminder_patient"
  | "medicine_refill_patient"
  | "membership_renewal_patient"
  | "patient_reengagement"
  | "home_care_booking_patient"
  | "home_care_visit_patient"
  | "home_visit_booking_patient"
  | "home_visit_reminder_patient"
  | "ip_admission_patient"
  | "ip_discharge_patient"
  | "physiotherapy_case_patient"
  | "physiotherapy_session_patient"
  | "pharmacy_dispense_patient"
  | "service_invoice_patient"
  | "service_follow_up_patient";

export type WhatsAppLanguage =
  | "en"
  | "ta";

  export type WhatsAppCustomTemplate = {
    id: string;
    name: string;
    description: string;
    audience: "patient" | "doctor" | "user";
    enabled: boolean;
    trigger_key: WhatsAppFlowKey;
    identifiers: Partial<Record<WhatsAppLanguage, string>>;
    // Ordered field keys (from fieldCatalog[trigger_key]) filling {{1}}, {{2}}...
    parameters: string[];
  };

  export type WhatsAppFieldOption = { key: string; label: string };


  export type WhatsAppSettingsDraft = {
    enabled: boolean;
    apiUrl: string;
    publicMediaBaseUrl: string;
    appointmentViewUrl: string;
    apiKey: string;
    defaultCountryCode: string;
    timeoutSeconds: number;
    maxAttempts: number;
    patientNotificationsEnabled: boolean;
    doctorNotificationsEnabled: boolean;
    appointmentReminder24hEnabled: boolean;
    appointmentReminder2hEnabled: boolean;
    defaultLanguage: WhatsAppLanguage;
    templates: Record<WhatsAppFlowKey, string>;
    localizedTemplates: Partial<
      Record<WhatsAppLanguage, Record<WhatsAppFlowKey, string>>
    >;
    flows: Record<WhatsAppFlowKey, boolean>;
    customTemplates: WhatsAppCustomTemplate[];
    fieldCatalog: Partial<Record<WhatsAppFlowKey, WhatsAppFieldOption[]>>;
    // Ordered field keys filling {{1}}, {{2}}... for each built-in flow's own
    // identifier. Always fully populated by the backend (falls back to the
    // catalog default order for anything the tenant hasn't customized).
    templateFieldMappings: Partial<Record<WhatsAppFlowKey, string[]>>;
  };

  export type WhatsAppTestDraft = {
    mobile: string;
    recipientName: string;
    flowKey: WhatsAppFlowKey;
    // When set, this test targets a custom template (identified by id)
    // instead of the built-in flow — flowKey still holds that template's
    // trigger_key so existing display logic keyed on flowKey keeps working.
    customTemplateId: string | null;
    language: WhatsAppLanguage;
    parameters: string[];
    mediaUrl: string;
    mediaFilename: string;
  };
