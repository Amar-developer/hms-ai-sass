import { colorList, COLORS } from "./constants";

export function userInitials(user: any, email: string) {
  const source = String(user?.name || email || "User").trim();
  const parts = source.split(/[\s.@_-]+/).filter(Boolean);
  return (
    (parts[0]?.[0] || "U").toUpperCase() +
    ((parts[1]?.[0] || "") as string).toUpperCase()
  );
}

export function capitalizeFirst(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function displayDate(value: any, fallback = "-") {
  if (!value) return fallback;
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}/.test(raw)
    ? new Date(`${raw.slice(0, 10)}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    date.getFullYear(),
  ].join("/");
}

export function isoToDisplayDate(value: any, fallback = "") {
  if (!value) return fallback;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [year, month, day] = raw.slice(0, 10).split("-");
    return `${day}/${month}/${year}`;
  }
  return displayDate(value, fallback);
}

export function displayToIsoDate(value: any) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (!match) return "";
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3];
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() + 1 !== Number(month) ||
    date.getDate() !== Number(day)
  ) {
    return "";
  }
  return `${year}-${month}-${day}`;
}

// Backend timestamps are stored in UTC but serialized without a timezone
// designator (e.g. "2026-06-26T09:19:00"). The browser would otherwise parse
// such a naive string as local time, leaving the displayed clock off by the
// local UTC offset. Treat a designator-less date-time as UTC so it converts to
// the viewer's local time correctly. Values that already carry a Z/offset (or
// are plain dates) are left untouched.
export function parseInstant(value: any) {
  const raw = String(value).trim();
  if (
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw) &&
    !/([zZ])|([+-]\d{2}:?\d{2})$/.test(raw)
  ) {
    return new Date(`${raw.replace(" ", "T")}Z`);
  }
  return new Date(value);
}

export function displayDateTime(value: any, fallback = "-") {
  if (!value) return fallback;
  const date = parseInstant(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const datePart = [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    date.getFullYear(),
  ].join("/");
  return `${datePart}, ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function splitRows(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
export function appendLine(value: string, line: string) {
  return [...splitRows(value), line].join("\n");
}

export function inr(value: any) {
  return `₹. ${Number(value || 0).toLocaleString("en-IN")}`;
}

export function patientName(p: any) {
  return p?.name || p?.full_name || p?.patient_name || p?.id || "Patient";
}

export function money(value: any) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "₹0";
  const sign = amount < 0 ? "-" : "";
  const rounded = Math.round(Math.abs(amount));
  return `${sign}₹${rounded.toLocaleString("en-IN")}`;
}

export const formatPrice = (value: number) =>
    value > 0 ? `₹${value.toLocaleString("en-IN")}` : "";


export function activeTenantOptions(tenants: any[]) {
  const seen = new Set<string>();
  return (tenants || []).filter((tenant: any) => {
    if (tenant.status === "suspended") return false;
    const key = String(tenant.name || tenant.id || "")
      .trim()
      .toLowerCase();
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  });
}

export function roleKeyFromName(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}


export function userIcon(fullName = "") {
  const name = fullName.trim();

  // Split by one or more spaces
  const parts = name.split(/\s+/).filter(Boolean);

  let initials = "?";

  if (parts.length >= 2) {
    // First letter of first and second words
    initials = `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  } else if (parts.length === 1) {
    // First letter of the single word
    initials = parts[0][0].toUpperCase();
  }

  // Generate a consistent hash from the full name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  const color = colorList[Math.abs(hash) % COLORS.length];

  return {
    initials,
    color,
  };
}
