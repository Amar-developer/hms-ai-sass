"use client";

import { useEffect, useState } from "react";
import { Badge, Card, Input, RefreshButton } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { groupRolesByName } from "../../helpers";
import { CreateActionButton } from "../shared/CreateActionButton";
import { Pagination } from "@/app/components/common/Pagination";
import { TenantPicker } from "../shared/TenantPicker";
import {
  FilterSection,
  FilterConfig,
} from "@/app/components/common/FilterSection";
import { DataTable } from "@/app/components/common/DataTable";
import { SortState } from "@/utils/types";
import { getRoleColumns } from "./Column";
import { dateFieldOptions, status_options } from "../../constants";

const filterConfigs: FilterConfig[] = [
  {
    key: "status",
    label: "Status",
    options: status_options,
  },
  // {
  //   key: "dateField",
  //   label: "Date field",
  //   options: dateFieldOptions,
  // },
];

export function RolesManagement({
  tenants,
  selectedId,
  setSelectedId,
  selected,
  roles,
  canCopyIds = false,
  setSelectedRoleId,
  setSection,
  setConfirmAction,
  onRefresh,
  busy,
}: any) {
  const [filters, setFilters] = useState({
    query: "",
    status: "all",
    fromDate: "",
    toDate: "",
    dateField: "updated_at",
  });
  const [sort, setSort] = useState<SortState>({ key: "updated_at", dir: "desc" });
  const [page, setPage] = useState(1);
  const pageSize = 8;

  function updateFilter(key: string, value: string) {
    setFilters({ ...filters, [key]: value });
  }
  function resetFilters() {
    setFilters({
      query: "",
      status: "all",
      fromDate: "",
      toDate: "",
      dateField: "updated_at",
    });
  }
  function value(role: any, key: string) {
    return key === "created_at" || key === "updated_at"
      ? new Date(role[key] || role.created_at || 0).getTime()
      : String(role[key] || "").toLowerCase();
  }

  const groupedRoles = groupRolesByName(roles);
  const filtered = groupedRoles
    .filter((role: any) => {
      const text = [
        role.name,
        role.display_key,
        role.id,
        (role.rows || []).map((row: any) => row.key).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      const dateValue = role[filters.dateField] || role.created_at;
      const timestamp = dateValue ? new Date(dateValue).getTime() : 0;
      const from = filters.fromDate ? new Date(filters.fromDate).getTime() : 0;
      const to = filters.toDate
        ? new Date(`${filters.toDate}T23:59:59`).getTime()
        : Number.MAX_SAFE_INTEGER;
      return (
        (!filters.query || text.includes(filters.query.toLowerCase())) &&
        (filters.status === "all" ||
          (filters.status === "active" ? role.is_active : !role.is_active)) &&
        (!filters.fromDate || timestamp >= from) &&
        (!filters.toDate || timestamp <= to)
      );
    })
    .sort((a: any, b: any) => {
      const left = value(a, sort.key);
      const right = value(b, sort.key);
      if (left < right) return sort.dir === "asc" ? -1 : 1;
      if (left > right) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [filters, sort, roles.length]);

  const openRole = (role: any, sectionId = "rolePermissions") => {
    setSelectedRoleId(role.primary.id);
    setSection(sectionId);
  };

  const roleColumns = getRoleColumns({
    canCopyIds,
    openRole,
    setConfirmAction,
  });

  return (
    <div className="mt-3">
      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex">
              <h3 className="card-title font-bold mr-3">Roles</h3>
              <Badge
                tone={selected?.is_primary ? "blue" : "slate"}
                className="normal-badge"
              >
                {selected?.is_primary
                  ? "Global templates"
                  : `${filtered.length} roles`}
              </Badge>
            </div>
            <p className="card-desc text-slate-500">
              {selected?.is_primary
                ? "Primary tenant roles are global templates. Assign templates to customer tenants to avoid duplicate setup."
                : "Create, edit, deactivate, and search tenant roles with latest changes shown first."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh ? <RefreshButton onRefresh={onRefresh} /> : null}
            <CreateActionButton
              label="Create Role"
              onClick={() => setSection("roleCreate")}
            />
          </div>
        </div>
        <FilterSection
          title="Role"
          query={filters.query}
          setQuery={(value) => updateFilter("query", value)}
          searchPlaceholder="Role name"
          filters={filterConfigs}
          filterValues={filters}
          onFilterChange={updateFilter}
          onReset={resetFilters}
          className="lg:grid-cols-4 xl:grid-cols-6"
        >
          <TenantPicker
            tenants={tenants}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
          />
          {/* <FormField label="From">
            <Input
              type="date"
              value={filters.fromDate}
              onChange={(e: any) => updateFilter("fromDate", e.target.value)}
            />
          </FormField>
          <FormField label="To">
            <Input
              type="date"
              value={filters.toDate}
              onChange={(e: any) => updateFilter("toDate", e.target.value)}
            />
          </FormField> */}
        </FilterSection>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
          <div className="min-w-[720px]">
            <DataTable
              columns={roleColumns}
              data={rows}
              loading={busy && rows.length === 0}
              emptyMessage="No roles match your search."
              onRowClick={(role) => openRole(role)}
              sort={sort}
              onSortChange={setSort}
            />
          </div>
        </div>
        <Pagination
          page={safePage}
          totalPages={totalPages}
          total={filtered.length}
          pageSize={pageSize}
          onPage={setPage}
        />
      </Card>
    </div>
  );
}
