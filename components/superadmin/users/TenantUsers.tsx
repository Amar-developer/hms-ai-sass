"use client";

import { useEffect, useState } from "react";
import {
  ActionButton,
  ActionGroup,
  Badge,
  Card,
  Field,
  Input,
  Select,
} from "@/components/common/ui";
import { formatDate, formatTitle } from "../../../utils/superAdmin/superAdmin";
import { userTypes } from "../../../utils/superAdmin/constants";
import { CreateActionButton } from "../shared/CreateActionButton";
import { Empty } from "@/components/admin/Empty";
import { Pagination } from "@/components/admin/Pagination";
import { SortButton } from "../shared/SortButton";
import { TenantPicker } from "../shared/TenantPicker";
import { UserRoleList } from "./UserRoleList";

export function TenantUsers({
  tenants,
  selectedId,
  setSelectedId,
  users,
  setSelectedUserId,
  setSection,
  setConfirmAction,
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
  function rowValue(user: any, key: string) {
    return key === "created_at" || key === "updated_at"
      ? new Date(user[key] || user.created_at || 0).getTime()
      : String(user[key] || "").toLowerCase();
  }

  const filtered = users
    .filter((user: any) => {
      const text = [
        user.name,
        user.email,
        user.mobile,
        user.user_type,
        user.roles,
        user.id,
      ]
        .join(" ")
        .toLowerCase();
      const dateValue = user[filters.dateField] || user.created_at;
      const timestamp = dateValue ? new Date(dateValue).getTime() : 0;
      const from = filters.fromDate ? new Date(filters.fromDate).getTime() : 0;
      const to = filters.toDate
        ? new Date(`${filters.toDate}T23:59:59`).getTime()
        : Number.MAX_SAFE_INTEGER;
      return (
        (!filters.query || text.includes(filters.query.toLowerCase())) &&
        (filters.status === "all" ||
          (filters.status === "active" ? user.is_active : !user.is_active)) &&
        (!filters.fromDate || timestamp >= from) &&
        (!filters.toDate || timestamp <= to)
      );
    })
    .sort((a: any, b: any) => {
      const left = rowValue(a, sort.key);
      const right = rowValue(b, sort.key);
      if (left < right) return sort.dir === "asc" ? -1 : 1;
      if (left > right) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [filters, sort, users.length]);

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="text-lg font-bold">Users</h3>
          <p className="text-sm text-slate-500">
            Create, edit, activate/deactivate, and search tenant users.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="blue" className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm">{filtered.length} users</Badge>
          <CreateActionButton
            label="Create User"
            onClick={() => setSection("userCreate")}
          />
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-6">
        <TenantPicker
          tenants={tenants}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
        />
        <Field label="User">
          <Input
            value={filters.query}
            onChange={(e: any) => updateFilter("query", e.target.value)}
            placeholder="Name, email, mobile, type"
            className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
          />
        </Field>
        <Field label="Status">
          <Select
            value={filters.status}
            onChange={(e: any) => updateFilter("status", e.target.value)}
            className="rounded-lg px-2 py-1.5 lg:px-4 lg:py-3 text-xs lg:text-sm"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
        <Field label="Date field">
          <Select
            value={filters.dateField}
            onChange={(e: any) => updateFilter("dateField", e.target.value)}
            className="rounded-lg px-2 py-1.5 lg:px-4 lg:py-3 text-xs lg:text-sm"
          >
            <option value="updated_at">Modified date</option>
            <option value="created_at">Created date</option>
          </Select>
        </Field>
        <Field label="From">
          <Input
            type="date"
            value={filters.fromDate}
            onChange={(e: any) => updateFilter("fromDate", e.target.value)}
            className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
          />
        </Field>
        <Field label="To">
          <Input
            type="date"
            value={filters.toDate}
            onChange={(e: any) => updateFilter("toDate", e.target.value)}
            className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
          />
        </Field>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <div className="min-w-[1420px]">
          <div className="hidden md:grid-cols-[1fr_1.15fr_.72fr_1.15fr_.65fr_.55fr_.65fr_.65fr_1.45fr] items-center gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 md:grid">
            <SortButton
              label="User"
              field="name"
              sort={sort}
              onSort={changeSort}
            />
            <SortButton
              label="Email"
              field="email"
              sort={sort}
              onSort={changeSort}
            />
            <SortButton
              label="Type"
              field="user_type"
              sort={sort}
              onSort={changeSort}
            />
            <span>Roles</span>
            <span>Mobile</span>
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
            {rows.length === 0 && <Empty text="No users match your search." />}
            {rows.map((user: any) => {
              const typeLabel =
                userTypes.find(([value]) => value === user.user_type)?.[1] ||
                formatTitle(
                  String(user.user_type || "Staff").replaceAll("_", " "),
                );
              const open = () => {
                setSelectedUserId(user.id);
                setSection("userEdit");
              };
              const stop = (handler: () => void) => (event: any) => {
                event.stopPropagation();
                handler();
              };
              return (
                <div
                  key={user.id}
                  role="button"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={(event: any) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      open();
                    }
                  }}
                  className="grid cursor-pointer gap-3 px-4 py-4 text-sm transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none md:grid-cols-[1fr_1.15fr_.72fr_1.15fr_.65fr_.70fr_.65fr_.65fr_1.45fr] md:items-center"
                >
                  <div>
                    <b className="text-xs lg:text-sm">{user.name}</b>
                    <p className="text-[10px] lg:text-xs text-slate-500">
                      {user.user_number || "User account"}
                    </p>
                  </div>
                  <span className="break-all text-xs lg:text-sm">
                    {user.email}
                  </span>
                  <span className="text-xs lg:text-sm">{typeLabel}</span>
                  <UserRoleList user={user} />
                  <span className="text-xs lg:text-sm">{user.mobile || "-"}</span>
                  <Badge
                    tone={user.is_active ? "green" : "red"}
                    className="rounded-full text-xs py-1 px-1"
                  >
                    {user.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <span className="text-xs lg:text-sm flex justify-start items-center">
                    {formatDate(user.created_at)}
                  </span>
                  <span className="text-xs lg:text-sm flex justify-start items-center">
                    {formatDate(user.updated_at)}
                  </span>
                  <ActionGroup>
                    <ActionButton onClick={stop(open)}>Edit</ActionButton>
                    <ActionButton
                      onClick={stop(() =>
                        setConfirmAction({
                          entity: "user",
                          kind: "status",
                          user,
                        }),
                      )}
                    >
                      {user.is_active ? "Inactive" : "Active"}
                    </ActionButton>
                    <ActionButton
                      tone="danger"
                      onClick={stop(() =>
                        setConfirmAction({
                          entity: "user",
                          kind: "delete",
                          user,
                        }),
                      )}
                    >
                      Delete
                    </ActionButton>
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
