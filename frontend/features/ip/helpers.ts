import { today } from "@/utils/helper";


export function parseAmount(value: any) {
  const amount = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}
export function catalogKey(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
export function isClosedAdmission(admission: any) {
  return ["discharged", "cancelled"].includes(
    String(admission?.status || "").toLowerCase(),
  );
}

export function admissionLabel(row: any) {
  return `${row.admission_number || row.id} · ${row.ward || "Ward"} · Bed ${row.bed || "-"}`;
}

export function chargeableDays(start: any, end: any) {
  const s = new Date(`${start || today()}T00:00:00`);
  const e = new Date(`${end || today()}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 1;
  return Math.max(Math.floor((e.getTime() - s.getTime()) / 86400000) + 1, 1);
}
export function datetimeLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
export function doseUnits(dosage: string) {
  const normalized = String(dosage || "").toLowerCase();
  if (
    !/(tab|tablet|cap|capsule|sachet|vial|amp|drop|puff|spoon)/.test(normalized)
  )
    return 1;
  const fraction = normalized.match(/(\d+)\s*\/\s*(\d+)/);
  if (fraction && Number(fraction[2]) > 0)
    return Math.max(Number(fraction[1]) / Number(fraction[2]), 0.5);
  const match = normalized.match(/\d+(\.\d+)?/);
  return Math.max(match ? Number(match[0]) : 1, 0.5);
}
export function dailyDoseQuantity(dosage: string, frequency: string) {
  const normalized = String(frequency || "")
    .trim()
    .toLowerCase();
  const compact = normalized.replace(/[\s._]+/g, "");
  let doses = 1;
  if (/^\d+(-\d+)+$/.test(compact))
    doses = compact
      .split("-")
      .reduce((sum, part) => sum + Number(part || 0), 0);
  else if (["bd", "bid", "twice", "twiceaday", "twicedaily"].includes(compact))
    doses = 2;
  else if (
    ["tds", "tid", "thrice", "thriceaday", "thricedaily"].includes(compact)
  )
    doses = 3;
  else if (["qid", "qds", "fourtimesaday"].includes(compact)) doses = 4;
  else {
    const every = normalized.match(/(?:q|every)\s*(\d+)\s*(h|hr|hour)/);
    const times = normalized.match(/(\d+)\s*(times|time|x)\s*(a|per)?\s*day/);
    if (every && Number(every[1]) > 0)
      doses = Math.max(24 / Number(every[1]), 1);
    else if (times) doses = Number(times[1]);
    else {
      const numbers = [...normalized.matchAll(/\d+/g)].map((m) => Number(m[0]));
      if (numbers.length) doses = numbers.reduce((sum, row) => sum + row, 0);
    }
  }
  return Math.max(Math.ceil(doseUnits(dosage) * Math.max(doses, 1)), 1);
}


export function defaultRooms(branchId: string) {
  return [
    ["general", "General Ward", "shared", "GW-001", "GW-001-A", 800],
    ["general", "General Ward", "shared", "GW-001", "GW-001-B", 800],
    ["general", "General Ward", "shared", "GW-002", "GW-002-A", 800],
    ["private", "Private Room", "single", "PR-101", "PR-101", 2500],
    ["private", "Private Room", "single", "PR-102", "PR-102", 2500],
    ["icu", "ICU", "critical_care", "ICU-01", "ICU-01", 6000],
    ["icu", "ICU", "critical_care", "ICU-02", "ICU-02", 6000],
    ["emergency", "Emergency Ward", "observation", "ER-01", "ER-01-A", 1500],
    ["emergency", "Emergency Ward", "observation", "ER-01", "ER-01-B", 1500],
  ].map(
    ([
      ward_type,
      ward_name,
      room_type,
      room_number,
      bed_number,
      daily_rate,
    ]) => ({
      branch_id: branchId,
      ward_type,
      ward_name,
      room_type,
      room_number,
      bed_number,
      daily_rate,
    }),
  );
}
