import { publicDisplayValue } from "@/lib/options";
import {
  userRoleLabels,
  formatDate,
  isLocked,
  roleKeyLabel,
  scopeLabel,
} from "@/utils/tenantAdmin/helpers";
import { ClickableRow, RoleList, RowActions } from "./Shared";
import { Badge } from "../common/ui";
import { Column } from "@/utils/tenantAdmin/types";

export type Role = {
  id: string;
  name: string;
  key: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export function UserRow({ user, branches, onEdit, onStatus, onDelete }: any) {
  const branch = branches.find((row: any) => row.id === user.branch_id);
  const roleLabels = userRoleLabels(user);

  return (
    <ClickableRow onClick={onEdit} className="flex w-max border">
      {/* Name */}
      <div className="w-[180px] table-cell-ellipsis">
        <span className="table-text font-bold" title={user.name}>
          {user.name}
        </span>
      </div>

      <div className="w-[220px] table-cell-ellipsis">
        <span className="table-text" title={user.email}>
          {user.email}
        </span>
      </div>

      <div className="w-[200px] table-cell-ellipsis">
        <span className="table-text">
          <RoleList labels={roleLabels} />
        </span>
      </div>

      <div className="w-[180px] table-cell-ellipsis">
        <span className="table-text" title={branch?.name}>
          {branch?.name || "All branches"}
        </span>
      </div>

      {/* Status */}
      <div className="min-w-[120px] px-2 flex items-center text-xs">
        <Badge
          tone={user.is_active ? "green" : "red"}
          className="rounded-full text-xs py-1 px-1"
        >
          {user.is_active ? "Active" : "Inactive"}
        </Badge>
      </div>

      {/* Created */}
      <div className="min-w-[100px] px-2 flex items-center text-xs">
        {formatDate(user.created_at)}
      </div>

      {/* Actions */}
      <div className="min-w-[140px] px-2 flex items-center text-xs">
        <RowActions
          row={user}
          onEdit={onEdit}
          onStatus={onStatus}
          onDelete={onDelete}
        />
      </div>
    </ClickableRow>
  );
}

export function RoleRow({ role, onEdit, onStatus, onDelete }: any) {
  const locked = isLocked(role);

  return (
    <ClickableRow onClick={onEdit} className="flex w-full border">
      {/* Role Name */}
      <div className="min-w-[200px] px-2 flex items-center text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <b className="truncate">{role.name}</b>

          {locked && (
            <Badge
              tone="purple"
              className="rounded-full text-[10px] px-2 py-[2px]"
            >
              Locked
            </Badge>
          )}
        </div>
      </div>

      {/* Key */}
      <div className="min-w-[180px] px-2 flex items-center text-xs">
        <span>{roleKeyLabel(role.key)}</span>
      </div>

      {/* Status */}
      <div className="min-w-[140px] px-2 flex items-center text-xs">
        <Badge
          tone={role.is_active ? "green" : "red"}
          className="rounded-full text-[10px] px-2 py-[2px]"
        >
          {role.is_active ? "Active" : "Inactive"}
        </Badge>
      </div>

      {/* Modified */}
      <div className="min-w-[140px] px-2 flex items-center text-xs">
        {formatDate(role.updated_at || role.created_at)}
      </div>

      {/* Actions */}
      <div className="min-w-[160px] px-2 flex items-center text-xs">
        <div onClick={(e) => e.stopPropagation()}>
          <RowActions
            row={role}
            locked={locked}
            onEdit={onEdit}
            onStatus={onStatus}
            onDelete={onDelete}
          />
        </div>
      </div>
    </ClickableRow>
  );
}

export function DepartmentRow({ department, onEdit, onStatus, onDelete }: any) {
  return (
    <ClickableRow onClick={onEdit} className="flex w-max border">
      <div className="min-w-[200px] px-2 flex items-center text-xs">
        <span className="font-bold">{department.name}</span>

        {department.locked && (
          <span className="ml-2">
            <Badge tone="purple">Locked</Badge>
          </span>
        )}
      </div>

      <div className="min-w-[160px] px-2 flex items-center text-xs">
        {department.code}
      </div>

      <div className="min-w-[200px] px-2 flex items-center text-xs">
        {department.branch_names || "All branches"}
      </div>

      <div className="min-w-[120px] px-2 flex items-center text-xs">
        <Badge
          tone={department.is_active ? "green" : "red"}
          className="rounded-full py-1 text-xs"
        >
          {department.is_active ? "Active" : "Inactive"}
        </Badge>
      </div>

      <div className="min-w-[160px] px-2 flex items-center text-xs">
        <RowActions
          row={department.primary || department}
          locked={department.locked}
          onEdit={onEdit}
          onStatus={onStatus}
          onDelete={onDelete}
        />
      </div>
    </ClickableRow>
  );
}

export function BranchRow({ branch, onEdit, onStatus, onDelete }: any) {
  return (
    <ClickableRow onClick={onEdit} className="flex w-max border">
      <div className="min-w-[200px] px-2 flex items-center text-xs">
        <b>{branch.name}</b>

        {isLocked(branch) && (
          <span className="ml-2">
            <Badge tone="purple">Locked</Badge>
          </span>
        )}
      </div>

      <div className="min-w-[100px] px-2 flex items-center text-xs">
        {branch.code}
      </div>

      <div className="min-w-[260px] px-2 flex items-center text-xs">
        {[branch.area, branch.city, branch.state].filter(Boolean).join(", ") ||
          "-"}
      </div>

      <div className="min-w-[120px] px-2 flex items-center text-xs">
        <Badge
          tone={branch.is_active ? "green" : "red"}
          className="rounded-full py-1 text-xs"
        >
          {branch.is_active ? "Active" : "Inactive"}
        </Badge>
      </div>

      <div className="min-w-[160px] px-2 flex items-center text-xs">
        <RowActions
          row={branch}
          locked={isLocked(branch)}
          onEdit={onEdit}
          onStatus={onStatus}
          onDelete={onDelete}
        />
      </div>
    </ClickableRow>
  );
}

export function SupplierRow({ supplier, onEdit, onStatus, onDelete }: any) {
  return (
    <ClickableRow onClick={onEdit} className="flex border min-w-max">
      <div className="min-w-[220px] px-2 flex items-center text-xs">
        <b>{supplier.name}</b>
      </div>

      <div className="min-w-[160px] px-2 flex items-center text-xs">
        {supplier.gstin || "-"}
      </div>

      <div className="min-w-[260px] px-2 flex items-center text-xs">
        <div>
          <b>{supplier.phone || "-"}</b>
          <p className="text-slate-500 break-all text-xs">
            {supplier.email || supplier.address || "-"}
          </p>
        </div>
      </div>

      <div className="min-w-[120px] px-2 flex items-center text-xs">
        <Badge
          tone={supplier.is_active ? "green" : "red"}
          className="rounded-full py-1 text-xs"
        >
          {supplier.is_active ? "Active" : "Inactive"}
        </Badge>
      </div>

      <div className="min-w-[160px] px-2 flex items-center text-xs">
        <RowActions
          row={supplier}
          onEdit={onEdit}
          onStatus={onStatus}
          onDelete={onDelete}
        />
      </div>
    </ClickableRow>
  );
}

export function TaxRuleRow({
  rule,
  branches,
  onEdit,
  onStatus,
  onDelete,
}: any) {
  const branch = branches.find((row: any) => row.id === rule.branch_id);

  return (
    <ClickableRow onClick={onEdit} className="flex w-max border">
      <div className="min-w-[180px] px-2 flex items-center text-xs">
        <b>{rule.name}</b>
      </div>

      <div className="min-w-[260px] px-2 flex items-center text-xs">
        {scopeLabel(rule.service_scope)} · {branch?.name || "All branches"}
      </div>

      <div className="min-w-[140px] px-2 flex items-center text-xs">
        <div>
          <b>{rule.tax_percentage}%</b>
          <p className="text-slate-500 text-xs">{rule.tax_label || "GST"}</p>
        </div>
      </div>

      <div className="min-w-[120px] px-2 flex items-center text-xs">
        <Badge
          tone={rule.is_active ? "green" : "red"}
          className="rounded-full py-1 text-xs"
        >
          {rule.is_active ? "Active" : "Inactive"}
        </Badge>
      </div>

      <div className="min-w-[160px] px-2 flex items-center text-xs">
        <RowActions
          row={rule}
          onEdit={onEdit}
          onStatus={onStatus}
          onDelete={onDelete}
        />
      </div>
    </ClickableRow>
  );
}

export function DiscountOfferRow({
  offer,
  branches,
  onEdit,
  onStatus,
  onDelete,
}: any) {
  const branch = branches.find((row: any) => row.id === offer.branch_id);

  const value =
    offer.discount_type === "fixed"
      ? `₹${Number(offer.value || 0).toLocaleString("en-IN")}`
      : `${offer.value}%`;

  const code = publicDisplayValue(offer.code, "");

  const minimum = Number(offer.minimum_bill_amount || 0);

  return (
    <ClickableRow onClick={onEdit} className="flex w-max border">
      <div className="min-w-[140px] px-2 flex items-center text-xs">
        <div>
          <b>{offer.name}</b>
        </div>
      </div>

      <div className="min-w-[260px] px-2 flex items-center text-xs">
        {scopeLabel(offer.service_scope)} · {branch?.name || "All branches"}
      </div>

      <div className="min-w-[200px] px-2 flex items-center text-xs">
        <div>
          <b>{value}</b>
          <p className="text-slate-500 text-xs">
            {minimum > 0
              ? `Min ₹${minimum.toLocaleString("en-IN")}`
              : "No minimum"}{" "}
            ·{" "}
            {offer.max_discount_amount
              ? `Max ₹${Number(offer.max_discount_amount).toLocaleString("en-IN")}`
              : "No cap"}
          </p>
        </div>
      </div>

      <div className="min-w-[100px] px-2 flex items-center text-xs">
        <Badge
          tone={offer.is_active ? "green" : "red"}
          className="rounded-full py-1 text-xs"
        >
          {offer.is_active ? "Active" : "Inactive"}
        </Badge>
      </div>

      <div className="min-w-[160px] px-2 flex items-center text-xs">
        <RowActions
          row={offer}
          onEdit={onEdit}
          onStatus={onStatus}
          onDelete={onDelete}
        />
      </div>
    </ClickableRow>
  );
}
