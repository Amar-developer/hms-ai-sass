export function isDispensed(issue: any) {
  return ["dispensed"].includes(String(issue?.status || ""));
}

export function isCancelledIssue(issue: any) {
  return String(issue?.status || "") === "cancelled";
}

export function isBilledIssue(issue: any) {
  return String(issue?.status || "") === "billed";
}

export function splitList(value: any) {
  return String(value || "")
    .split(/\n|,(?=\s*[A-Za-z0-9])|\s+\|\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseMedicines(text: string) {
  return String(text || "")
    .split(/\n|,\s+(?=[A-Za-z])/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s*\|\s*/).map((p: string) => p.trim());
      return normalizeMedicineSchedule({
        name: parts[0] || "",
        dosage: parts[1] || "",
        frequency: parts[2] || "",
        duration: parts[3] || "",
        instructions: parts[4] || "",
      });
    });
}

export function looksLikeFrequency(value: any) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  return (
    /^\d+\s*[-–]\s*\d+\s*[-–]\s*\d+$/.test(text) ||
    [
      "od",
      "bd",
      "tds",
      "qid",
      "hs",
      "sos",
      "daily",
      "once daily",
      "twice daily",
    ].includes(text)
  );
}

export function looksLikeDuration(value: any) {
  return /\b\d+\s*(d|day|days|week|weeks|month|months)\b/i.test(
    String(value || "").trim(),
  );
}

export function normalizeMedicineSchedule(row: any) {
  if (
    looksLikeFrequency(row?.dosage) &&
    looksLikeDuration(row?.frequency) &&
    !looksLikeDuration(row?.duration)
  ) {
    return {
      ...row,
      dosage: "",
      frequency: row.dosage,
      duration: row.frequency,
      instructions: row.duration || row.instructions || "",
    };
  }
  return row;
}
