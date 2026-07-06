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
  const branch = branches.find((b: any) => b.id === user.branch_id);

  const actions = [
    {
      label: "Edit",
      onClick: onEdit,
    },
    {
      label: user.is_active ? "Inactive" : "Active",
      onClick: onStatus,
    },
    {
      label: "Delete",
      onClick: onDelete,
      danger: true,
    },
  ];

  return (
    <tr className="border-b hover:bg-slate-50 cursor-pointer" onClick={onEdit}>
      <td className="px-4 py-3 font-bold whitespace-nowrap">{user.name}</td>

      <td className="px-4 py-3 whitespace-nowrap">
        <Badge tone={user.is_active ? "green" : "red"} className="rounded-full">
          {user.is_active ? "Active" : "Inactive"}
        </Badge>
      </td>

      <td className="px-4 py-3">
        <RoleList labels={userRoleLabels(user)} />
      </td>

      <td className="px-4 py-3">{user.email}</td>

      <td className="px-4 py-3">{branch?.name ?? "All branches"}</td>

      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <RowActions actions={actions} className="right-16 -bottom-5" />
      </td>
    </tr>
  );
}

export function RoleRow({ role, onEdit, onStatus, onDelete }: any) {
  const locked = isLocked(role);

  const actions = [
    {
      label: locked ? "View" : "Edit",
      onClick: onEdit,
    },
    {
      label: role.is_active ? "Inactive" : "Active",
      onClick: onStatus,
      hidden: locked,
    },
    {
      label: "Delete",
      onClick: onDelete,
      hidden: locked,
      danger: true,
    },
  ];

  return (
    <tr onClick={onEdit} className="cursor-pointer border-b hover:bg-slate-50">
      <td className="px-4 py-3 text-xs">
        <div className="flex items-center gap-2">
          <b>{role.name}</b>

          {locked && (
            <Badge
              tone="purple"
              className="rounded-full px-2 py-[2px] text-[10px]"
            >
              Locked
            </Badge>
          )}
        </div>
      </td>

      <td className="px-4 py-3 text-xs whitespace-nowrap">
        {roleKeyLabel(role.key)}
      </td>

      <td className="px-4 py-3 text-xs whitespace-nowrap">
        <Badge
          tone={role.is_active ? "green" : "red"}
          className="rounded-full px-2 py-[2px] text-[10px]"
        >
          {role.is_active ? "Active" : "Inactive"}
        </Badge>
      </td>

      <td className="px-4 py-3 text-xs whitespace-nowrap">
        {formatDate(role.updated_at || role.created_at)}
      </td>

      <td className="px-4 py-3 text-xs" onClick={(e) => e.stopPropagation()}>
        <RowActions actions={actions} className="right-28 -bottom-5"/>
      </td>
    </tr>
  );
}

export function DepartmentRow({ department, onEdit, onStatus, onDelete }: any) {
  console.log(department, "department");
  const actions = [
    {
      label: "Edit",
      onClick: onEdit,
    },
    {
      label: department.is_active ? "Inactive" : "Active",
      onClick: onStatus,
    },
    {
      label: "Delete",
      onClick: onDelete,
      danger: true,
    },
  ];

  return (
    <tr onClick={onEdit} className="cursor-pointer border-b hover:bg-slate-50">
      <td className="px-4 py-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold">{department.name}</span>

          {department.locked && <Badge tone="purple">Locked</Badge>}
        </div>
      </td>

      <td className="px-4 py-3 text-xs whitespace-nowrap">{department.code}</td>

      <td className="px-4 py-3 text-xs">
        {department.branch_names || "All branches"}
      </td>

      <td className="px-4 py-3 text-xs whitespace-nowrap">
        <Badge
          tone={department.is_active ? "green" : "red"}
          className="rounded-full py-1"
        >
          {department.is_active ? "Active" : "Inactive"}
        </Badge>
      </td>

      <td className="px-4 py-3 text-xs">
        <RowActions actions={actions} className="right-28 -bottom-5"/>
      </td>
    </tr>
  );
}

export function BranchRow({ branch, onEdit, onStatus, onDelete }: any) {
  const actions = [
    {
      label: "Edit",
      onClick: onEdit,
    },
    {
      label: branch.is_active ? "Inactive" : "Active",
      onClick: onStatus,
    },
    {
      label: "Delete",
      onClick: onDelete,
      danger: true,
    },
  ];
  return (
    <tr onClick={onEdit} className="cursor-pointer border-b hover:bg-slate-50">
      <td className="px-4 py-3 text-xs">
        <div className="flex items-center gap-2">
          <b>{branch.name}</b>

          {isLocked(branch) && <Badge tone="purple">Locked</Badge>}
        </div>
      </td>

      <td className="px-4 py-3 text-xs whitespace-nowrap">{branch.code}</td>

      <td className="px-4 py-3 text-xs">
        {[branch.area, branch.city, branch.state].filter(Boolean).join(", ") ||
          "-"}
      </td>

      <td className="px-4 py-3 text-xs whitespace-nowrap">
        <Badge
          tone={branch.is_active ? "green" : "red"}
          className="rounded-full py-1"
        >
          {branch.is_active ? "Active" : "Inactive"}
        </Badge>
      </td>

      <td className="px-4 py-3 text-xs">
        <RowActions actions={actions}  className="right-24 -bottom-5"/>
      </td>
    </tr>
  );
}

export function SupplierRow({ supplier, onEdit, onStatus, onDelete }: any) {
  const actions = [
    {
      label: "Edit",
      onClick: onEdit,
    },
    {
      label: supplier.is_active ? "Inactive" : "Active",
      onClick: onStatus,
    },
    {
      label: "Delete",
      onClick: onDelete,
      danger: true,
    },
  ];
  return (
    <tr onClick={onEdit} className="cursor-pointer border-b hover:bg-slate-50">
      <td className="px-4 py-3 text-xs">
        <b>{supplier.name}</b>
      </td>

      <td className="px-4 py-3 text-xs whitespace-nowrap">
        {supplier.gstin || "-"}
      </td>

      <td className="px-4 py-3 text-xs">
        <div>
          <b>{supplier.phone || "-"}</b>
          <p className="text-slate-500">
            {supplier.email || supplier.address || "-"}
          </p>
        </div>
      </td>

      <td className="px-4 py-3 text-xs whitespace-nowrap">
        <Badge
          tone={supplier.is_active ? "green" : "red"}
          className="rounded-full py-1"
        >
          {supplier.is_active ? "Active" : "Inactive"}
        </Badge>
      </td>

      <td className="px-4 py-3 text-xs">
        <RowActions actions={actions} className="right-28 -bottom-5"/>
      </td>
    </tr>
  );
}

export function TaxRuleRow({
  rule,
  branches,
  onEdit,
  onStatus,
  onDelete,
}: any) {
  const branch = branches.find((b: any) => b.id === rule.branch_id);
  const actions = [
    {
      label: "Edit",
      onClick: onEdit,
    },
    {
      label: rule.is_active ? "Inactive" : "Active",
      onClick: onStatus,
    },
    {
      label: "Delete",
      onClick: onDelete,
      danger: true,
    },
  ];
  return (
    <tr onClick={onEdit} className="cursor-pointer border-b hover:bg-slate-50">
      <td className="px-4 py-3 text-xs">
        <b>{rule.name}</b>
      </td>

      <td className="px-4 py-3 text-xs">
        {scopeLabel(rule.service_scope)} · {branch?.name || "All branches"}
      </td>

      <td className="px-4 py-3 text-xs">
        <div>
          <b>{rule.tax_percentage}%</b>
          <p className="text-slate-500">{rule.tax_label || "GST"}</p>
        </div>
      </td>

      <td className="px-4 py-3 text-xs whitespace-nowrap">
        <Badge
          tone={rule.is_active ? "green" : "red"}
          className="rounded-full py-1"
        >
          {rule.is_active ? "Active" : "Inactive"}
        </Badge>
      </td>

      <td className="px-4 py-3 text-xs">
        <RowActions actions={actions} className="right-28 -bottom-5"/>
      </td>
    </tr>
  );
}

export function DiscountOfferRow({
  offer,
  branches,
  onEdit,
  onStatus,
  onDelete,
}: any) {
  const branch = branches.find((b: any) => b.id === offer.branch_id);
  const actions = [
    {
      label: "Edit",
      onClick: onEdit,
    },
    {
      label: offer.is_active ? "Inactive" : "Active",
      onClick: onStatus,
    },
    {
      label: "Delete",
      onClick: onDelete,
      danger: true,
    },
  ];
  const value =
    offer.discount_type === "fixed"
      ? `₹${Number(offer.value || 0).toLocaleString("en-IN")}`
      : `${offer.value}%`;

  const minimum = Number(offer.minimum_bill_amount || 0);

  return (
    <tr onClick={onEdit} className="cursor-pointer border-b hover:bg-slate-50">
      <td className="px-4 py-3 text-xs">
        <b>{offer.name}</b>
      </td>

      <td className="px-4 py-3 text-xs">
        {scopeLabel(offer.service_scope)} · {branch?.name || "All branches"}
      </td>

      <td className="px-4 py-3 text-xs">
        <div>
          <b>{value}</b>

          <p className="text-slate-500">
            {minimum > 0
              ? `Min ₹${minimum.toLocaleString("en-IN")}`
              : "No minimum"}{" "}
            ·{" "}
            {offer.max_discount_amount
              ? `Max ₹${Number(offer.max_discount_amount).toLocaleString(
                  "en-IN",
                )}`
              : "No cap"}
          </p>
        </div>
      </td>

      <td className="px-4 py-3 text-xs whitespace-nowrap">
        <Badge
          tone={offer.is_active ? "green" : "red"}
          className="rounded-full py-1"
        >
          {offer.is_active ? "Active" : "Inactive"}
        </Badge>
      </td>

      <td className="px-4 py-3 text-xs">
        <RowActions
          actions={actions}
          className="right-24 -bottom-5"
        />
      </td>
    </tr>
  );
}
