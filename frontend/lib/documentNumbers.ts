export function displayDocumentNumber(
  value: unknown,
  numberingRules: any,
  entity: string,
) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const tenantPrefix = String(numberingRules?.prefix || "")
    .trim()
    .toUpperCase();
  const entityCode = String(numberingRules?.entities?.[entity] || "")
    .trim()
    .toUpperCase();

  if (!tenantPrefix || !entityCode) return raw;
  if (raw.toUpperCase().startsWith(`${tenantPrefix}-`)) return raw;
  if (raw.toUpperCase().startsWith(`${entityCode}-`)) {
    return `${tenantPrefix}-${raw}`;
  }
  return raw;
}
