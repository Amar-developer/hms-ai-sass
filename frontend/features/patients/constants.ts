import { CreditCard, Home, NotepadText, ReceiptText, Stethoscope } from "lucide-react";
import { SectionTab } from "./types";

export const hiddenScrollbar =
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export const genders = [
  ["select gender", "Select gender"],
  ["male", "Male"],
  ["female", "Female"],
  ["other", "Other"],
  ["unknown", "Unknown"],
] as const;

export const bloodGroups = [
  ["", "Select blood group"],
  ["A+", "A+"],
  ["A-", "A-"],
  ["B+", "B+"],
  ["B-", "B-"],
  ["AB+", "AB+"],
  ["AB-", "AB-"],
  ["O+", "O+"],
  ["O-", "O-"],
] as const;

export const statusOptions = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "deceased", label: "Deceased" },
];

export const enrollmentPageSize = 10;

export const patient_status_options = [
  { value: "all", label: "All status" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "deceased", label: "Deceased" },
];

export const whatsup_options = [
  { value: "not_recorded", label: "Not recorded" },
  { value: "opted_in", label: "Patient opted in" },
  { value: "opted_out", label: "Patient opted out" },
];

export const source_options = [
  { value: "", label: "Select source" },
  { value: "patient_verbal", label: "Patient verbal" },
  { value: "patient_written", label: "Patient written" },
  { value: "digital", label: "Digital consent" },
  { value: "imported", label: "Imported record" },
];

export const language_options = [
  { value: "en", label: "English (default)" },
  { value: "ta", label: "Tamil" },
];

export const familyRelationshipOptions = [
  { value: "father", label: "Father" },
  { value: "mother", label: "Mother" },
  { value: "son", label: "Son" },
  { value: "daughter", label: "Daughter" },
  { value: "spouse", label: "Spouse" },
  { value: "brother", label: "Brother" },
  { value: "sister", label: "Sister" },
  { value: "grandfather", label: "Grandfather" },
  { value: "grandmother", label: "Grandmother" },
  { value: "guardian", label: "Guardian" },
  { value: "other_family", label: "Other Family" },
];

export const message_language_options = {
  tenant_default: "English",
  en: "English",
  hi: "Hindi",
  mr: "Marathi",
  gu: "Gujarati",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  bn: "Bengali",
  pa: "Punjabi",
  ur: "Urdu",
};

export const sms_language_options = {
  tenant_default: "English",
  en: "English",
  hi: "Hindi",
  mr: "Marathi",
  gu: "Gujarati",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  bn: "Bengali",
  pa: "Punjabi",
  ur: "Urdu",
};

// Lab & Services, Medicines, and Diagnosis moved to the dedicated Patient
// History module (search a patient, see everything on one page) — dropped
// here so they aren't duplicated as tabs.
export const SECTION_TABS: SectionTab[] = [
  { id: "home", label: "Overview", icon: Home},
  { id: "consultations", label: "Consultations", icon: Stethoscope },
  { id: "billing", label: "Billing", icon: ReceiptText },
  { id: "membership", label: "Membership & Family", icon: CreditCard },
  { id: "patient_tracking", label: "Patient Tracking", icon:  NotepadText},
];
