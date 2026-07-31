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
