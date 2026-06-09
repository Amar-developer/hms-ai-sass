export function userInitials(user: any, email: string) {
  const source = String(user?.name || email || "User").trim();
  const parts = source.split(/[\s.@_-]+/).filter(Boolean);
  return (
    (parts[0]?.[0] || "U").toUpperCase() +
    ((parts[1]?.[0] || "") as string).toUpperCase()
  );
}

export function displayDate(value: any, fallback = "-") {
  if (!value) return fallback;
  const raw = String(value);
  const date =
    /^\d{4}-\d{2}-\d{2}/.test(raw)
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

export function displayDateTime(value: any, fallback = "-") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return `${displayDate(value, fallback)}, ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}
