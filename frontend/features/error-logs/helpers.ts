export function levelTone(level: string) {
  if (level === "critical" || level === "error") {
    return "red";
  }

  return "amber";
}

export function statusLabel(row: any) {
  if (row.status_code) {
    return `HTTP ${row.status_code}`;
  }

  return row.category?.replace(/_/g, " ") || "Application";
}
