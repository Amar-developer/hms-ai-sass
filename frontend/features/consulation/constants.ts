export const vitalFields = [
  {
    key: "BP",
    label: "BP",
    placeholder: "120/80 mmHg",
    aliases: ["bp", "blood pressure"],
  },
  {
    key: "Pulse",
    label: "Pulse / PR",
    placeholder: "78 bpm",
    aliases: ["pulse", "pr"],
  },
  { key: "Spo2", label: "SpO2", placeholder: "98%", aliases: ["spo2", "spo₂"] },
  {
    key: "Temp",
    label: "Temp",
    placeholder: "98.6F",
    aliases: ["temp", "temperature"],
  },
  { key: "Height", label: "Height", placeholder: "170cm", aliases: ["height"] },
  { key: "Weight", label: "Weight", placeholder: "65kg", aliases: ["weight"] },
];

export const treatment_type_options = [
  {
    value: "general_consultation",
    label: "General Consultation",
  },
  { value: "doctor_review", label: "Doctor Review" },
  {
    value: "fitness_certificate",
    label: "Fitness Certificate",
  },
  {
    value: "pediatric_consultation",
    label: "Pediatric Consultation",
  },
  {
    value: "diabetology_consultation",
    label: "Diabetology Consultation",
  },
  { value: "procedure_review", label: "Procedure Review" },
  { value: "follow_up", label: "Follow-up" },
];

export const COMPLAINT_SUGGESTIONS = [
  "Fever | 2 days | medium",
  "Cough | 1 day | mild",
  "Headache | 3 days | severe",
  "Body pain | 2 days | medium",
  "Cold & running nose | 1 day | mild",
  "Stomach pain | 1 day | medium",
  "Sore throat | 2 days | mild",
  "Fatigue | 3 days | medium",
];
