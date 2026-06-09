import { humanizeOptionLabel,publicDisplayValue } from "@/lib/options";
import { userTypes } from "@/utils/tenantAdmin/constants";
import { userRoleLabels,formatDate,isLocked,roleKeyLabel,scopeLabel } from "@/utils/tenantAdmin/helpers";
import { ClickableRow,RoleList,RowActions } from "./Shared";
import { Badge } from "../common/ui";

export function UserRow({ user, branches, onEdit, onStatus, onDelete }: any) {
  const branch = branches.find((row: any) => row.id === user.branch_id);
  const typeLabel =
    userTypes.find(([value]) => value === user.user_type)?.[1] ||
    humanizeOptionLabel(user.user_type, "Staff");
  const roleLabels = userRoleLabels(user);
  return (
    <ClickableRow
      onClick={onEdit}
      className="xl:grid-cols-[1fr_1.15fr_.72fr_1.15fr_.9fr_.6fr_.65fr_1.7fr]"
    >
      <div>
        <b>{user.name}</b>
      </div>
      <span className="break-all">{user.email}</span>
      <span>{typeLabel}</span>
      <RoleList labels={roleLabels} />
      <span>{branch?.name || "All branches"}</span>
      <Badge tone={user.is_active ? "green" : "red"}>
        {user.is_active ? "Active" : "Inactive"}
      </Badge>
      <span>{formatDate(user.created_at)}</span>
      <RowActions
        row={user}
        onEdit={onEdit}
        onStatus={onStatus}
        onDelete={onDelete}
      />
    </ClickableRow>
  );
}

export function RoleRow({ role, onEdit, onStatus, onDelete }: any) {
  return (
    <ClickableRow
      onClick={onEdit}
      className="xl:grid-cols-[1.15fr_.75fr_1.2fr_.65fr_1.45fr]"
    >
      <div>
        <b>{role.name}</b>
        {isLocked(role) && (
          <span className="ml-2">
            <Badge tone="purple">Locked</Badge>
          </span>
        )}
      </div>
      <span>{roleKeyLabel(role.key)}</span>
      <Badge tone={role.is_active ? "green" : "red"}>
        {role.is_active ? "Active" : "Inactive"}
      </Badge>
      <span>{formatDate(role.updated_at || role.created_at)}</span>
      <RowActions
        row={role}
        locked={isLocked(role)}
        onEdit={onEdit}
        onStatus={onStatus}
        onDelete={onDelete}
      />
    </ClickableRow>
  );
}

export function DepartmentRow({ department, onEdit, onStatus, onDelete }: any) {
  return (
    <ClickableRow
      onClick={onEdit}
      className="xl:grid-cols-[1.15fr_.75fr_1.2fr_.65fr_1.45fr]"
    >
      <div>
        <b>{department.name}</b>
        {department.locked && (
          <span className="ml-2">
            <Badge tone="purple">Locked</Badge>
          </span>
        )}
        <p className="text-xs text-slate-500">
          {department.rows?.length > 1
            ? `${department.rows.length} branch mappings`
            : "Single branch mapping"}
        </p>
      </div>
      <span>{department.code}</span>
      <span>{department.branch_names || "All branches"}</span>
      <Badge tone={department.is_active ? "green" : "red"}>
        {department.is_active ? "Active" : "Inactive"}
      </Badge>
      <RowActions
        row={department.primary || department}
        locked={department.locked}
        onEdit={onEdit}
        onStatus={onStatus}
        onDelete={onDelete}
      />
    </ClickableRow>
  );
}

export function BranchRow({ branch, onEdit, onStatus, onDelete }: any) {
  return (
    <ClickableRow
      onClick={onEdit}
      className="xl:grid-cols-[1.15fr_.75fr_1.2fr_.65fr_1.45fr]"
    >
      <div>
        <b>{branch.name}</b>
        {isLocked(branch) && (
          <span className="ml-2">
            <Badge tone="purple">Locked</Badge>
          </span>
        )}
      </div>
      <span>{branch.code}</span>
      <span>
        {[branch.area, branch.city, branch.state].filter(Boolean).join(", ") ||
          "-"}
      </span>
      <Badge tone={branch.is_active ? "green" : "red"}>
        {branch.is_active ? "Active" : "Inactive"}
      </Badge>
      <RowActions
        row={branch}
        locked={isLocked(branch)}
        onEdit={onEdit}
        onStatus={onStatus}
        onDelete={onDelete}
      />
    </ClickableRow>
  );
}

export function SupplierRow({ supplier, onEdit, onStatus, onDelete }: any) {
  return (
    <ClickableRow
      onClick={onEdit}
      className="xl:grid-cols-[1.15fr_.75fr_1.2fr_.65fr_1.45fr]"
    >
      <div>
        <b>{supplier.name}</b>
      </div>
      <span>{supplier.gstin || "-"}</span>
      <span>
        <b>{supplier.phone || "-"}</b>
        <p className="break-all text-xs text-slate-500">
          {supplier.email || supplier.address || "-"}
        </p>
      </span>
      <Badge tone={supplier.is_active ? "green" : "red"}>
        {supplier.is_active ? "Active" : "Inactive"}
      </Badge>
      <RowActions
        row={supplier}
        onEdit={onEdit}
        onStatus={onStatus}
        onDelete={onDelete}
      />
    </ClickableRow>
  );
}

export function TaxRuleRow({ rule, branches, onEdit, onStatus, onDelete }: any) {
  const branch = branches.find((row: any) => row.id === rule.branch_id);
  return (
    <ClickableRow
      onClick={onEdit}
      className="xl:grid-cols-[1.15fr_.75fr_1.2fr_.65fr_1.45fr]"
    >
      <div>
        <b>{rule.name}</b>
      </div>
      <span>
        {scopeLabel(rule.service_scope)} · {branch?.name || "All branches"}
      </span>
      <span>
        <b>{rule.tax_percentage}%</b>
        <p className="text-xs text-slate-500">{rule.tax_label || "GST"}</p>
      </span>
      <Badge tone={rule.is_active ? "green" : "red"}>
        {rule.is_active ? "Active" : "Inactive"}
      </Badge>
      <RowActions
        row={rule}
        onEdit={onEdit}
        onStatus={onStatus}
        onDelete={onDelete}
      />
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
    <ClickableRow
      onClick={onEdit}
      className="xl:grid-cols-[1.15fr_.75fr_1.2fr_.65fr_1.45fr]"
    >
      <div>
        <b>{offer.name}</b>
        {code && <p className="break-all text-xs text-slate-500">{code}</p>}
      </div>
      <span>
        {scopeLabel(offer.service_scope)} · {branch?.name || "All branches"}
      </span>
      <span>
        <b>{value}</b>
        <p className="text-xs text-slate-500">
          {minimum > 0
            ? `Min bill ₹${minimum.toLocaleString("en-IN")}`
            : "No minimum"}{" "}
          ·{" "}
          {offer.max_discount_amount
            ? `Max ₹${Number(offer.max_discount_amount).toLocaleString("en-IN")}`
            : "No cap"}
        </p>
      </span>
      <Badge tone={offer.is_active ? "green" : "red"}>
        {offer.is_active ? "Active" : "Inactive"}
      </Badge>
      <RowActions
        row={offer}
        onEdit={onEdit}
        onStatus={onStatus}
        onDelete={onDelete}
      />
    </ClickableRow>
  );
}
