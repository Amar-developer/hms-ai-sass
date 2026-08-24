import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Card, Badge } from "@/app/components/common/ui";
import { RowActions } from "@/features/admin/components/RowActions";
import { displayDate, money } from "@/utils/helper";
import { enrollmentPageSize } from "../constants";
import { FilterSection } from "@/app/components/common/FilterSection";
import { DataTable } from "@/app/components/common/DataTable";
import { PatientFlagBadges } from "./PatientFlagBadges";

export function ActiveEnrollmentsTable({
  rows,
  patientMap,
  canManage,
  busy,
  onUpdate,
  onCancel,
}: any) {
  const [query, setQuery] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({
    plan: "all",
    status: "all",
  });
  const [editing, setEditing] = useState<any | null>(null);

  // Derive unique plan & status options from data
  const planOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((row: any) => {
      const id = row.plan?.id || row.plan_id || row.plan?.name;
      const name = row.plan?.name || "Membership plan";
      if (id) map.set(String(id), name);
    });
    return [
      { value: "all", label: "All Plans" },
      ...Array.from(map.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [rows]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row: any) => {
      if (row.status) set.add(String(row.status));
    });
    return [
      { value: "all", label: "All Status" },
      ...Array.from(set).map((s) => ({
        value: s,
        label: s.charAt(0).toUpperCase() + s.slice(1),
      })),
    ];
  }, [rows]);

  const filters = [
    { key: "plan", label: "Plan", options: planOptions },
    { key: "status", label: "Status", options: statusOptions },
  ];

  function onFilterChange(key: string, value: string) {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }

  // Apply search + filters
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row: any) => {
      // Search
      if (q) {
        const name =
          row.patient_name ||
          patientMap.get(row.patient_id)?.name ||
          patientMap.get(row.patient_id)?.full_name ||
          "";
        const number =
          row.patient_number ||
          patientMap.get(row.patient_id)?.patient_number ||
          "";
        const planName = row.plan?.name || "";
        const haystack = `${name} ${number} ${planName}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // Plan filter
      if (filterValues.plan !== "all") {
        const planId = String(row.plan?.id || row.plan_id || row.plan?.name || "");
        if (planId !== filterValues.plan) return false;
      }

      // Status filter
      if (filterValues.status !== "all") {
        if (String(row.status) !== filterValues.status) return false;
      }

      return true;
    });
  }, [rows, query, filterValues, patientMap]);

  function startEdit(row: any) {
    setEditing({
      id: row.id,
      starts_on: String(row.starts_on || "").slice(0, 10),
      ends_on: String(row.ends_on || "").slice(0, 10),
      paid_amount: String(row.paid_amount ?? 0),
      used_consultations: String(row.used_consultations ?? 0),
    });
  }

  function editValue(key: string, value: string) {
    setEditing((current: any) => ({ ...current, [key]: value }));
  }

  function saveEdit(row: any) {
    if (!editing) return;
    onUpdate(row, {
      starts_on: editing.starts_on,
      ends_on: editing.ends_on,
      paid_amount: Number(editing.paid_amount || 0),
      used_consultations: Number(editing.used_consultations || 0),
    });
    setEditing(null);
  }

  const columns = [
    {
      key: "index",
      header: "S.No",
      width: "80px",
      render: (_row: any, index: number) => (
        <span className="font-semibold text-slate-500 text-xs lg:text-sm">
          {index + 1}
        </span>
      ),
    },
    {
      key: "patient",
      header: "Patient",
      width: "140px",
      render: (row: any) => {
        const patient = patientMap.get(row.patient_id);
        return (
          <div>
            <b className="text-xs lg:text-sm">
              {row.patient_name || patient?.name || patient?.full_name || "Patient"}
            </b>
            <PatientFlagBadges patient={patient} className="mt-1" />
          </div>
        );
      },
    },
    {
      key: "patient_number",
      header: "ID",
      width: "180px",
      render: (row: any) => (
        <p className="text-xs text-slate-500 lg:text-sm">
          {row.patient_number ||
            patientMap.get(row.patient_id)?.patient_number ||
            ""}
        </p>
      ),
    },
    {
      key: "plan",
      header: "Plan",
      width: "160px",
      render: (row: any) => (
        <b className="text-xs lg:text-sm">
          {row.plan?.name || "Membership plan"}
        </b>
      ),
    },
    {
      key: "validity",
      header: "Validity",
      width: "160px",
      render: (row: any) => {
        const isEditing = editing?.id === row.id;
        if (isEditing) {
          return (
            <div className="grid gap-1">
              <input
                type="date"
                value={editing.starts_on}
                disabled
                className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1.5 text-xs text-slate-500"
              />
              <input
                type="date"
                value={editing.ends_on}
                onChange={(e: any) => editValue("ends_on", e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              />
            </div>
          );
        }
        return (
          <div className="text-xs lg:text-sm">
            {displayDate(row.starts_on)} to {displayDate(row.ends_on)}
          </div>
        );
      },
    },
    {
      key: "paid",
      header: "Paid",
      width: "120px",
      cellClassName: "text-left font-semibold tabular-nums text-xs lg:text-sm",
      render: (row: any) => {
        const isEditing = editing?.id === row.id;
        if (isEditing) {
          return (
            <input
              type="number"
              min="0"
              value={editing.paid_amount}
              onChange={(e: any) => editValue("paid_amount", e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs"
            />
          );
        }
        return money(row.paid_amount);
      },
    },
    {
      key: "status",
      header: "Status",
      width: "120px",
      render: (row: any) => (
        <Badge tone="green" className="normal-badge w-[60%]">
          {row.status}
        </Badge>
      ),
    },
  ];

  if (canManage) {
    columns.push({
      key: "actions",
      header: "Actions",
      width: "100px",
      cellClassName: "text-center",
      disableRowClick: true,
      render: (row: any) => {
        const isEditing = editing?.id === row.id;
        return (
          <div className="flex justify-center">
            <RowActions
              actions={
                isEditing
                  ? [
                      {
                        label: "Save",
                        onClick: () => saveEdit(row),
                        disabled: busy === `enrollment-${row.id}`,
                      },
                      {
                        label: "Cancel",
                        onClick: () => setEditing(null),
                      },
                    ]
                  : [
                      {
                        label: "Edit",
                        onClick: () => startEdit(row),
                      },
                      {
                        label: "Cancel",
                        onClick: () => onCancel(row),
                        disabled: busy === `enrollment-${row.id}`,
                        danger: true,
                      },
                    ]
              }
              className="right-10 -bottom-5"
            />
          </div>
        );
      },
    } as any);
  }

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="text-base lg:text-lg font-bold">Active Enrollments</h3>
          <p className="card-desc text-slate-500">
            Paginated table for active patient memberships.
          </p>
        </div>
        <Badge
          tone="green"
          className="w-[20%] lg:w-[15%] text-xs lg:text-sm rounded-full py-2 px-2"
        >
          {filteredRows.length} active
        </Badge>
      </div>

      {/* Filters */}
      <FilterSection
        title="Enrollments"
        query={query}
        setQuery={setQuery}
        filters={filters}
        filterValues={filterValues}
        onFilterChange={onFilterChange}
      />

      {/* Table */}
      <div className="mt-4">
        <DataTable
          columns={columns}
          data={filteredRows}
          emptyMessage="No active enrollments yet."
          emptyDescription="Patients with an active membership plan will appear here."
          emptyIcon={CheckCircle2}
          minBodyHeight="220px"
          paginate
          pageSize={enrollmentPageSize}
        />
      </div>
    </Card>
  );
}
