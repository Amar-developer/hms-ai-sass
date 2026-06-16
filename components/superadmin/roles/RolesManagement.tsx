"use client";

import { useEffect, useState } from "react";
import {
  ActionButton,
  ActionGroup,
  Badge,
  Card,
  Input,
  RefreshButton,
  Select,
} from "@/components/common/ui";
import { FormField } from "@/components/FormElements";
import {
  formatDate,
  groupRolesByName,
} from "../../../utils/superAdmin/superAdmin";
import { CreateActionButton } from "../shared/CreateActionButton";
import { Empty } from "@/components/admin/Empty";
import { Pagination } from "@/components/common/Pagination";
import { SortButton } from "../shared/SortButton";
import { TenantPicker } from "../shared/TenantPicker";

export function RolesManagement({
  tenants,
  selectedId,
  setSelectedId,
  selected,
  roles,
  setSelectedRoleId,
  setSection,
  setConfirmAction,
  onRefresh,
}: any) {
  const [filters, setFilters] = useState({
    query: "",
    status: "all",
    fromDate: "",
    toDate: "",
    dateField: "updated_at",
  });
  const [sort, setSort] = useState({ key: "updated_at", dir: "desc" });
  const [page, setPage] = useState(1);
  const pageSize = 8;

  function updateFilter(key: string, value: string) {
    setFilters({ ...filters, [key]: value });
  }
  function changeSort(key: string) {
    setSort(
      sort.key === key
        ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
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

  return (
    <Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex">
            <h3 className="card-title font-bold mr-3">Roles</h3>
            <Badge
              tone={selected?.is_primary ? "blue" : "slate"}
              className="table-status"
            >
              {selected?.is_primary
                ? "Global templates"
                : `${filtered.length} roles`}
            </Badge>
          </div>
          <p className="table-data text-slate-500">
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
      <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-6">
        <TenantPicker
          tenants={tenants}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
        />
        <FormField label="Role">
          <Input
            value={filters.query}
            onChange={(e: any) => updateFilter("query", e.target.value)}  
            placeholder="Role name"
            className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
          />
        </FormField>
        <FormField label="Status">
          <Select
            value={filters.status}
            onChange={(e: any) => updateFilter("status", e.target.value)}
            className="rounded-lg px-2 py-1.5 lg:px-4 lg:py-3 text-xs lg:text-sm"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </FormField>
        <FormField label="Date field">
          <Select
            value={filters.dateField}
            onChange={(e: any) => updateFilter("dateField", e.target.value)}
            className="rounded-lg px-2 py-1.5 lg:px-4 lg:py-3 text-xs lg:text-sm"
          >
            <option value="updated_at">Modified date</option>
            <option value="created_at">Created date</option>
          </Select>
        </FormField>
        <FormField label="From">
          <Input
            type="date"
            value={filters.fromDate}
            onChange={(e: any) => updateFilter("fromDate", e.target.value)}
            className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
          />
        </FormField>
        <FormField label="To">
          <Input
            type="date"
            value={filters.toDate}
            onChange={(e: any) => updateFilter("toDate", e.target.value)}
            className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
          />
        </FormField>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <div className="min-w-[720px]">
          <div className="hidden md:grid md:grid-cols-[2fr_1fr_.8fr_1fr_1fr_3fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500">
            <SortButton
              label="Role"
              field="name"
              sort={sort}
              onSort={changeSort}
            />
            <span>Scope</span>
            <SortButton
              label="Status"
              field="is_active"
              sort={sort}
              onSort={changeSort}
            />
            <SortButton
              label="Created"
              field="created_at"
              sort={sort}
              onSort={changeSort}
            />
            <SortButton
              label="Modified"
              field="updated_at"
              sort={sort}
              onSort={changeSort}
            />
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-slate-200">
            {rows.length === 0 && <Empty text="No roles match your search." />}
            {rows.map((role: any) => {
              const locked = role.locked;
              const stop = (handler: () => void) => (event: any) => {
                event.stopPropagation();
                handler();
              };
              return (
                <div
                  key={role.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openRole(role)}
                  onKeyDown={(event: any) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openRole(role);
                    }
                  }}
                  className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[2fr_1fr_.8fr_1fr_1fr_3fr] md:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-xs lg:text-sm">{role.name}</b>
                      {role.is_global_template && (
                        <Badge
                          tone="blue"
                          className="rounded-full px-2 py-2  lg:px-4 lg:py-3 text-xs lg:text-sm"
                        >
                          Global
                        </Badge>
                      )}
                      {locked && (
                        <Badge
                          tone="purple"
                          className="rounded-full px-1.5 py-1 lg:px-2 lg:py-2 text-[10px] lg:text-xs"
                        >
                          Locked
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs  text-slate-500">
                      {role.rows.length > 1
                        ? `${role.rows.length} branch variants grouped`
                        : role.primary.id}
                    </p>
                  </div>
                  <span className="text-xs lg:text-sm">{role.display_key}</span>
                  <Badge
                    tone={role.is_active ? "green" : "red"}
                    className=" rounded-full px-1.5 py-1.5  text-xs "
                  >
                    {role.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <span className="px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm">
                    {formatDate(role.created_at)}
                  </span>
                  <span className="px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm">
                    {formatDate(role.updated_at)}
                  </span>
                  <ActionGroup className="!flex-wrap xl:!flex-nowrap">
                    {!locked && (
                      <ActionButton
                        onClick={stop(() => openRole(role, "roleEdit"))}
                      >
                        Edit
                      </ActionButton>
                    )}
                    <ActionButton
                      onClick={stop(() => openRole(role, "rolePermissions"))}
                      disabled={locked}
                    >
                      Permissions
                    </ActionButton>
                    {role.key !== "super_admin" && (
                      <ActionButton
                        onClick={stop(() => openRole(role, "roleAssign"))}
                      >
                        Assign
                      </ActionButton>
                    )}
                    {!locked && (
                      <ActionButton
                        onClick={stop(() =>
                          setConfirmAction({
                            entity: "role",
                            kind: "status",
                            role: role.primary,
                          }),
                        )}
                      >
                        {role.is_active ? "Inactive" : "Active"}
                      </ActionButton>
                    )}
                    {!locked && (
                      <ActionButton
                        tone="danger"
                        onClick={stop(() =>
                          setConfirmAction({
                            entity: "role",
                            kind: "delete",
                            role: role.primary,
                          }),
                        )}
                      >
                        Delete
                      </ActionButton>
                    )}
                  </ActionGroup>
                </div>
              );
            })}
          </div>
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
  );
}
