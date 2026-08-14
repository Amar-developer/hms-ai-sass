export type QueryFieldType = "text" | "select" | "number" | "date";

export type QueryFieldOption = { value: string; label: string };

// Describes one column a user can build an ad-hoc filter row against —
// distinct from the fixed dropdown filters in a TableSchema, which stay
// server-backed. This drives the "+ Add a Filter" builder: field, operator,
// value, one row per condition, all rows AND-ed together.
export type QueryFieldSchema = {
  key: string;
  label: string;
  type: QueryFieldType;
  options?: QueryFieldOption[];
};

export type QueryOperator =
  | "equals"
  | "not_equals"
  | "like"
  | "not_like"
  | "in"
  | "not_in"
  | "is_set"
  | "is_not_set"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "between"
  | "is"
  | "before"
  | "after"
  | "on_or_before"
  | "on_or_after"
  | "timespan"
  | "fiscal_year";

export type QueryFilterRow = {
  id: string;
  field: string;
  operator: QueryOperator;
  value: string;
  value2?: string;
};

export const OPERATORS_BY_TYPE: Record<
  QueryFieldType,
  { value: QueryOperator; label: string }[]
> = {
  text: [
    { value: "like", label: "Like" },
    { value: "not_like", label: "Not Like" },
    { value: "equals", label: "Equals" },
    { value: "not_equals", label: "Not Equals" },
    { value: "is_set", label: "Is Set" },
    { value: "is_not_set", label: "Is Not Set" },
  ],
  select: [
    { value: "equals", label: "Equals" },
    { value: "not_equals", label: "Not Equals" },
    { value: "in", label: "In" },
    { value: "not_in", label: "Not In" },
    { value: "is_set", label: "Is Set" },
    { value: "is_not_set", label: "Is Not Set" },
  ],
  number: [
    { value: "equals", label: "Equals" },
    { value: "not_equals", label: "Not Equals" },
    { value: "gt", label: "Greater Than" },
    { value: "lt", label: "Less Than" },
    { value: "gte", label: "Greater Than Or Equal To" },
    { value: "lte", label: "Less Than Or Equal To" },
    { value: "between", label: "Between" },
  ],
  date: [
    { value: "is", label: "Is" },
    { value: "before", label: "Before" },
    { value: "after", label: "After" },
    { value: "on_or_after", label: "On or After" },
    { value: "on_or_before", label: "On or Before" },
    { value: "between", label: "Between" },
    { value: "timespan", label: "Timespan" },
    { value: "fiscal_year", label: "Fiscal Year" },
  ],
};

// "Timespan" value options — rolling/calendar-relative date windows, evaluated
// against the moment the filter runs (not when the row was written).
export const TIMESPAN_OPTIONS: QueryFieldOption[] = [
  { value: "last_week", label: "Last Week" },
  { value: "last_month", label: "Last Month" },
  { value: "last_quarter", label: "Last Quarter" },
  { value: "last_6_months", label: "Last 6 months" },
  { value: "last_year", label: "Last Year" },
  { value: "yesterday", label: "Yesterday" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "this_year", label: "This Year" },
  { value: "next_week", label: "Next Week" },
  { value: "next_month", label: "Next Month" },
  { value: "next_quarter", label: "Next Quarter" },
  { value: "next_6_months", label: "Next 6 months" },
  { value: "next_year", label: "Next Year" },
];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function endOfWeek(d: Date) {
  return endOfDay(addDays(startOfWeek(d), 6));
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
function startOfQuarter(d: Date) {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}
function endOfQuarter(d: Date) {
  const q = Math.floor(d.getMonth() / 3);
  return endOfDay(new Date(d.getFullYear(), q * 3 + 3, 0));
}
function startOfYear(d: Date) {
  return new Date(d.getFullYear(), 0, 1);
}
function endOfYear(d: Date) {
  return endOfDay(new Date(d.getFullYear(), 11, 31));
}

export function timespanRange(
  value: string,
  now: Date = new Date(),
): [Date, Date] | null {
  switch (value) {
    case "yesterday": {
      const d = addDays(now, -1);
      return [startOfDay(d), endOfDay(d)];
    }
    case "today":
      return [startOfDay(now), endOfDay(now)];
    case "tomorrow": {
      const d = addDays(now, 1);
      return [startOfDay(d), endOfDay(d)];
    }
    case "this_week":
      return [startOfWeek(now), endOfWeek(now)];
    case "last_week": {
      const d = addDays(now, -7);
      return [startOfWeek(d), endOfWeek(d)];
    }
    case "next_week": {
      const d = addDays(now, 7);
      return [startOfWeek(d), endOfWeek(d)];
    }
    case "this_month":
      return [startOfMonth(now), endOfMonth(now)];
    case "last_month": {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return [startOfMonth(d), endOfMonth(d)];
    }
    case "next_month": {
      const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return [startOfMonth(d), endOfMonth(d)];
    }
    case "this_quarter":
      return [startOfQuarter(now), endOfQuarter(now)];
    case "last_quarter": {
      const d = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return [startOfQuarter(d), endOfQuarter(d)];
    }
    case "next_quarter": {
      const d = new Date(now.getFullYear(), now.getMonth() + 3, 1);
      return [startOfQuarter(d), endOfQuarter(d)];
    }
    case "this_year":
      return [startOfYear(now), endOfYear(now)];
    case "last_year": {
      const d = new Date(now.getFullYear() - 1, 0, 1);
      return [startOfYear(d), endOfYear(d)];
    }
    case "next_year": {
      const d = new Date(now.getFullYear() + 1, 0, 1);
      return [startOfYear(d), endOfYear(d)];
    }
    case "last_6_months": {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 6);
      return [start, now];
    }
    case "next_6_months": {
      const end = new Date(now);
      end.setMonth(end.getMonth() + 6);
      return [now, end];
    }
    default:
      return null;
  }
}

// Fiscal year runs April 1 – March 31, matching this app's invoicing/reports
// (financial-year labelled monthly close, ₹ currency). "2026-2027" starts
// April 1, 2026. Options are generated relative to "now" — a few years back,
// one year forward — same spirit as the picker in the ERP reference shown.
export function fiscalYearOptions(
  now: Date = new Date(),
  yearsBack = 3,
  yearsForward = 1,
): QueryFieldOption[] {
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const options: QueryFieldOption[] = [];
  for (let i = yearsForward; i >= -yearsBack; i--) {
    const y = startYear + i;
    const label = `${y}-${y + 1}`;
    options.push({ value: label, label });
  }
  return options;
}

export function fiscalYearRange(value: string): [Date, Date] | null {
  const match = /^(\d{4})-(\d{4})$/.exec(value);
  if (!match) return null;
  const startYear = Number(match[1]);
  return [new Date(startYear, 3, 1), endOfDay(new Date(startYear + 1, 2, 31))];
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function rowMatchesFilter(
  row: any,
  field: QueryFieldSchema,
  filter: QueryFilterRow,
): boolean {
  const raw = row[filter.field];
  switch (filter.operator) {
    case "is_set":
      return raw !== null && raw !== undefined && String(raw).trim() !== "";
    case "is_not_set":
      return raw === null || raw === undefined || String(raw).trim() === "";
    case "equals":
      return normalize(raw) === normalize(filter.value);
    case "not_equals":
      return normalize(raw) !== normalize(filter.value);
    case "like":
      return normalize(raw).includes(normalize(filter.value));
    case "not_like":
      return !normalize(raw).includes(normalize(filter.value));
    case "in":
      return filter.value
        .split(",")
        .map(normalize)
        .includes(normalize(raw));
    case "not_in":
      return !filter.value
        .split(",")
        .map(normalize)
        .includes(normalize(raw));
    case "gt":
      return Number(raw) > Number(filter.value);
    case "lt":
      return Number(raw) < Number(filter.value);
    case "gte":
      return Number(raw) >= Number(filter.value);
    case "lte":
      return Number(raw) <= Number(filter.value);
    case "between": {
      if (field.type === "date") {
        const t = new Date(raw).getTime();
        return (
          t >= new Date(filter.value).getTime() &&
          t <= new Date(filter.value2 || filter.value).getTime()
        );
      }
      const n = Number(raw);
      return n >= Number(filter.value) && n <= Number(filter.value2 ?? filter.value);
    }
    case "is":
      return (
        new Date(raw).toDateString() === new Date(filter.value).toDateString()
      );
    case "before":
      return new Date(raw).getTime() < new Date(filter.value).getTime();
    case "after":
      return new Date(raw).getTime() > new Date(filter.value).getTime();
    case "on_or_before":
      return new Date(raw).getTime() <= new Date(filter.value).getTime();
    case "on_or_after":
      return new Date(raw).getTime() >= new Date(filter.value).getTime();
    case "timespan": {
      const range = timespanRange(filter.value);
      if (!range) return true;
      const t = new Date(raw).getTime();
      return t >= range[0].getTime() && t <= range[1].getTime();
    }
    case "fiscal_year": {
      const range = fiscalYearRange(filter.value);
      if (!range) return true;
      const t = new Date(raw).getTime();
      return t >= range[0].getTime() && t <= range[1].getTime();
    }
    default:
      return true;
  }
}

// Rows with no value yet (still being drafted) are ignored rather than
// excluding everything — matches picking a field/operator before typing.
export function applyQueryFilters<T = any>(
  rows: T[],
  fields: QueryFieldSchema[],
  filters: QueryFilterRow[],
): T[] {
  if (!filters.length) return rows;
  const fieldByKey = new Map(fields.map((f) => [f.key, f]));
  return rows.filter((row) =>
    filters.every((filter) => {
      const field = fieldByKey.get(filter.field);
      if (!field) return true;
      if (
        filter.operator !== "is_set" &&
        filter.operator !== "is_not_set" &&
        !filter.value.trim()
      )
        return true;
      return rowMatchesFilter(row, field, filter);
    }),
  );
}
