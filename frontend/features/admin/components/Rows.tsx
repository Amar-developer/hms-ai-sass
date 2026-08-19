import {
  userRoleLabels,
  formatDate,
  isLocked,
  roleKeyLabel,
  scopeLabel,
} from "../helpers";
import { RoleList } from "./RoleList";
import { RowActions } from "./RowActions";
import { Badge } from "@/app/components/common/ui";
import { CopyIdButton } from "@/app/components/common/CopyIdButton";

export function UserRow({
  user,
  index,
  roles = [],
  branches,
  canCopyIds = false,
  onEdit,
  onRowClick,
  onStatus,
  onDelete,
  canEdit = true,
  canDelete = true,
}: any) {
  const branch = branches.find((b: any) => b.id === user.branch_id);

  const actions = [
    {
      label: "Edit",
      onClick: onEdit,
      hidden: !onEdit || !canEdit,
    },
    {
      label: user.is_active ? "Inactive" : "Active",
      onClick: onStatus,
      hidden: !onStatus || !canEdit,
    },
    {
      label: "Delete",
      onClick: onDelete,
      hidden: !onDelete || !canDelete,
      danger: true,
    },
  ];

  return (
    <tr
      className="border-b hover:bg-slate-50 cursor-pointer"
      onClick={canEdit ? onRowClick || onEdit : undefined}
    >
      <td className="flex items-center justify-center  py-4">{index + 1}</td>
      <td className="px-4 py-3 font-bold whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span>{user.name}</span>
          <CopyIdButton value={user.id} label="User ID" allowed={canCopyIds} />
        </div>
      </td>

      <td className="px-4 py-3 whitespace-nowrap">
        <Badge tone={user.is_active ? "green" : "red"} className="normal-label">
          {user.is_active ? "Active" : "Inactive"}
        </Badge>
      </td>

      <td className="px-4 py-3">
        <RoleList labels={userRoleLabels(user, roles)} />
      </td>

      <td className="px-4 py-3">{user.email}</td>

      <td className="px-4 py-3">{branch?.name ?? "All branches"}</td>

      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <RowActions actions={actions} className="right-16 -bottom-5" />
      </td>
    </tr>
  );
}

export function RoleRow({
  role,
  index,
  canCopyIds = false,
  onEdit,
  onRowClick,
  onStatus,
  onDelete,
  canEdit = true,
  canDelete = true,
}: any) {
  const locked = isLocked(role);

  const actions = [
    {
      label: locked ? "Permissions" : "Edit",
      onClick: onEdit,
      hidden: !onEdit || !canEdit,
    },
    {
      label: role.is_active ? "Inactive" : "Active",
      onClick: onStatus,
      hidden: locked || !onStatus || !canEdit,
    },
    {
      label: "Delete",
      onClick: onDelete,
      hidden: locked || !onDelete || !canDelete,
      danger: true,
    },
  ];

  return (
    <tr
      onClick={canEdit ? onRowClick || onEdit : undefined}
      className="cursor-pointer border-b hover:bg-slate-50"
    >
      <td className="flex items-center justify-center  py-4">{index + 1}</td>
      <td className="px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <b>{role.name}</b>
          <CopyIdButton value={role.id} label="Role ID" allowed={canCopyIds} />

          {locked && (
            <Badge
              tone="purple"
              className="normal-label"
            >
              Locked
            </Badge>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm whitespace-nowrap">
        {roleKeyLabel(role.key)}
      </td>
      <td className="px-4 py-3 text-sm whitespace-nowrap">
        <Badge tone="slate" className="normal-label">
          {Array.isArray(role.permission_keys)
            ? role.permission_keys.length
            : 0}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm whitespace-nowrap">
        <Badge tone={role.is_active ? "green" : "red"} className="normal-label">
          {role.is_active ? "Active" : "Inactive"}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm whitespace-nowrap">
        {formatDate(role.updated_at || role.created_at)}
      </td>
      <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
        <RowActions actions={actions} className="right-20 -bottom-5" />
      </td>
    </tr>
  );
}

export function DepartmentRow({
  department,
  index,
  onEdit,
  onRowClick,
  onStatus,
  onDelete,
  canEdit = true,
  canDelete = true,
}: any) {
  const actions = [
    {
      label: "Edit",
      onClick: onEdit,
      hidden: !onEdit || !canEdit,
    },
    {
      label: department.is_active ? "Inactive" : "Active",
      onClick: onStatus,
      hidden: !onStatus || !canEdit,
    },
    {
      label: "Delete",
      onClick: onDelete,
      hidden: !onDelete || !canDelete,
      danger: true,
    },
  ];

  return (
    <tr
      onClick={canEdit ? onRowClick || onEdit : undefined}
      className="cursor-pointer border-b hover:bg-slate-50"
    >
      <td className="flex items-center justify-center py-4">{index + 1}</td>
      <td className="px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-bold">{department.name}</span>

          {department.locked && <Badge tone="purple">Locked</Badge>}
        </div>
      </td>
      <td className="px-4 py-3 text-sm whitespace-nowrap">{department.code}</td>
      <td className="px-4 py-3 text-sm">
        {department.branch_names || "All branches"}
      </td>
      <td className="px-4 py-3 text-sm whitespace-nowrap">
        <Badge
          tone={department.is_active ? "green" : "red"}
          className="normal-label"
        >
          {department.is_active ? "Active" : "Inactive"}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm">
        <RowActions actions={actions} className="right-28 -bottom-5" />
      </td>
    </tr>
  );
}

export function BranchRow({
  branch,
  index,
  canCopyIds = false,
  onEdit,
  onRowClick,
  onStatus,
  onDelete,
  canEdit = true,
  canDelete = true,
}: any) {
  const actions = [
    {
      label: "Edit",
      onClick: onEdit,
      hidden: !onEdit || !canEdit,
    },
    {
      label: branch.is_active ? "Inactive" : "Active",
      onClick: onStatus,
      hidden: !onStatus || !canEdit,
    },
    {
      label: "Delete",
      onClick: onDelete,
      hidden: !onDelete || !canDelete,
      danger: true,
    },
  ];
  return (
    <tr
      onClick={canEdit ? onRowClick || onEdit : undefined}
      className="cursor-pointer border-b hover:bg-slate-50"
    >
      <td className="flex items-center justify-center  py-4">{index + 1}</td>
      <td className="px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <b>{branch.name}</b>
          <CopyIdButton
            value={branch.id}
            label="Branch ID"
            allowed={canCopyIds}
          />

          {isLocked(branch) && <Badge tone="purple" className="normal-label">Locked</Badge>}
        </div>
      </td>
      <td className="px-4 py-3 text-sm whitespace-nowrap">{branch.code}</td>
      <td className="px-4 py-3 text-sm">
        {[branch.area, branch.city, branch.state].filter(Boolean).join(", ") ||
          "-"}
      </td>
      <td className="px-4 py-3 text-sm whitespace-nowrap">
        <Badge
          tone={branch.is_active ? "green" : "red"}
          className="normal-label"
        >
          {branch.is_active ? "Active" : "Inactive"}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm">
        <RowActions actions={actions} className="right-24 -bottom-5" />
      </td>
    </tr>
  );
}

export function SupplierRow({
  supplier,
  index,
  onEdit,
  onRowClick,
  onStatus,
  onDelete,
  canEdit = true,
  canDelete = true,
}: any) {
  const actions = [
    {
      label: "Edit",
      onClick: onEdit,
      hidden: !onEdit || !canEdit,
    },
    {
      label: supplier.is_active ? "Inactive" : "Active",
      onClick: onStatus,
      hidden: !onStatus || !canEdit,
    },
    {
      label: "Delete",
      onClick: onDelete,
      hidden: !onDelete || !canDelete,
      danger: true,
    },
  ];
  return (
    <tr
      onClick={canEdit ? onRowClick || onEdit : undefined}
      className="cursor-pointer border-b hover:bg-slate-50"
    >
      <td className="flex items-center justify-center  py-4">{index + 1}</td>
      <td className="px-4 py-3 text-sm">
        <b>{supplier.name}</b>
      </td>
      <td className="px-4 py-3 text-sm whitespace-nowrap">
        {supplier.gstin || "-"}
      </td>
      <td className="px-4 py-3 text-sm">
        <div>
          <b>{supplier.phone || "-"}</b>
          <p className="text-slate-500">
            {supplier.email || supplier.address || "-"}
          </p>
        </div>
      </td>
      <td className="px-4 py-3 text-sm whitespace-nowrap">
        <Badge
          tone={supplier.is_active ? "green" : "red"}
          className="normal-label"
        >
          {supplier.is_active ? "Active" : "Inactive"}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm">
        <RowActions actions={actions} className="right-28 -bottom-5" />
      </td>
    </tr>
  );
}

export function TaxRuleRow({
  rule,
  index,
  branches,
  onEdit,
  onRowClick,
  onStatus,
  onDelete,
  canEdit = true,
  canDelete = true,
}: any) {
  const branch = branches.find((b: any) => b.id === rule.branch_id);
  const actions = [
    {
      label: "Edit",
      onClick: onEdit,
      hidden: !onEdit || !canEdit,
    },
    {
      label: rule.is_active ? "Inactive" : "Active",
      onClick: onStatus,
      hidden: !onStatus || !canEdit,
    },
    {
      label: "Delete",
      onClick: onDelete,
      hidden: !onDelete || !canDelete,
      danger: true,
    },
  ];
  return (
    <tr
      onClick={canEdit ? onRowClick || onEdit : undefined}
      className="cursor-pointer border-b hover:bg-slate-50"
    >
      <td className="flex items-center justify-center  py-4">{index + 1}</td>
      <td className="px-4 py-3 text-sm">
        <b>{rule.name}</b>
      </td>
      <td className="px-4 py-3 text-sm">
        {scopeLabel(rule.service_scope)} · {branch?.name || "All branches"}
      </td>
      <td className="px-4 py-3 text-sm">
        <div>
          <b>{rule.tax_percentage}%</b>
          <p className="text-slate-500">{rule.tax_label || "GST"}</p>
        </div>
      </td>
      <td className="px-4 py-3 text-sm whitespace-nowrap">
        <Badge
          tone={rule.is_active ? "green" : "red"}
          className="normal-label"
        >
          {rule.is_active ? "Active" : "Inactive"}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm">
        <RowActions actions={actions} className="right-28 -bottom-5" />
      </td>
    </tr>
  );
}

export function DiscountOfferRow({
  offer,
  index,
  branches,
  onEdit,
  onRowClick,
  onStatus,
  onDelete,
  canEdit = true,
  canDelete = true,
}: any) {
  const branch = branches.find((b: any) => b.id === offer.branch_id);
  const actions = [
    {
      label: "Edit",
      onClick: onEdit,
      hidden: !onEdit || !canEdit,
    },
    {
      label: offer.is_active ? "Inactive" : "Active",
      onClick: onStatus,
      hidden: !onStatus || !canEdit,
    },
    {
      label: "Delete",
      onClick: onDelete,
      hidden: !onDelete || !canDelete,
      danger: true,
    },
  ];
  const value =
    offer.discount_type === "fixed"
      ? `₹${Number(offer.value || 0).toLocaleString("en-IN")}`
      : `${offer.value}%`;

  const minimum = Number(offer.minimum_bill_amount || 0);

  return (
    <tr
      onClick={canEdit ? onRowClick || onEdit : undefined}
      className="cursor-pointer border-b hover:bg-slate-50"
    >
      <td className="flex items-center justify-center  py-4">{index + 1}</td>
      <td className="px-4 py-3 text-sm">
        <b>{offer.name}</b>
      </td>
      <td className="px-4 py-3 text-sm">
        {scopeLabel(offer.service_scope)} · {branch?.name || "All branches"}
      </td>
      <td className="px-4 py-3 text-sm">
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
      <td className="px-4 py-3 text-sm whitespace-nowrap">
        <Badge
          tone={offer.is_active ? "green" : "red"}
          className="normal-label"
        >
          {offer.is_active ? "Active" : "Inactive"}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm">
        <RowActions actions={actions} className="right-24 -bottom-5" />
      </td>
    </tr>
  );
}
