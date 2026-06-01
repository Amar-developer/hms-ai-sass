export function normalizeOptionLabel(value:any){
  return String(value||'').trim().replace(/\s+/g,' ').toLowerCase();
}

export function humanizeOptionLabel(value:any,fallback='-'){
  const text=String(value??'').trim();
  if(!text)return fallback;
  return text
    .replace(/[._-]+/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g,(letter)=>letter.toUpperCase());
}

export function isInternalId(value:any){
  return /^(user|patient|invoice|consult|labord|pharm|medcat|labtest|taxrule|supplier|reportjob|branch|role|ptplan|ptsub|physiocase|ipadmission|payment|invitem)_[a-z0-9]/i.test(String(value||''));
}

export function publicDisplayValue(value:any,fallback='-'){
  const text=String(value??'').trim();
  if(!text||isInternalId(text))return fallback;
  return text;
}

export const basicMedicalDepartmentSuggestions = [
  "General Medicine",
  "Pediatrics",
  "Obstetrics and Gynecology",
  "Orthopedics",
  "Cardiology",
  "Neurology",
  "Dermatology",
  "ENT",
  "Ophthalmology",
  "Dental",
  "Emergency Medicine",
  "General Surgery",
  "Urology",
  "Nephrology",
  "Pulmonology",
  "Psychiatry",
  "Physiotherapy",
  "Radiology",
  "Pathology",
  "Anesthesiology",
] as const;

export const paymentMethodOptions = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "gpay", label: "GPay" },
  { value: "paytm", label: "Paytm" },
  { value: "credit_card", label: "Credit Card" },
  { value: "debit_card", label: "Debit Card" },
  { value: "bank_transfer", label: "Bank" },
] as const;

export function uniqueDepartmentRows<T extends {id?:string;name?:string;code?:string;is_active?:boolean}>(rows:T[], preferredId=''){
  const byLabel=new Map<string,T>();
  for(const row of rows||[]){
    const label=normalizeOptionLabel(row.name||row.code||row.id);
    if(!label)continue;
    const existing=byLabel.get(label);
    if(!existing){
      byLabel.set(label,row);
      continue;
    }
    if(preferredId&&row.id===preferredId){
      byLabel.set(label,row);
      continue;
    }
    if(existing.is_active===false&&row.is_active!==false){
      byLabel.set(label,row);
    }
  }
  return Array.from(byLabel.values());
}
