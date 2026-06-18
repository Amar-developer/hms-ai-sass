import { publicDisplayValue } from "@/lib/options";
import { userRoleLabels,formatDate,isLocked,roleKeyLabel,scopeLabel } from "@/utils/tenantAdmin/helpers";
import { ClickableRow,RoleList,RowActions } from "./Shared";
import { Badge } from "../common/ui";

export function UserRow({ user, branches, onEdit, onStatus, onDelete }: any) {
  const branch = branches.find((row: any) => row.id === user.branch_id);
  const roleLabels = userRoleLabels(user);
  return (
    <ClickableRow
      onClick={onEdit}
      className="md:grid-cols-[1fr_1.15fr_1.15fr_.9fr_.6fr_.65fr_1.7fr]"
    >
      <div>
        <b className="text-xs lg:text-sm">{user.name}</b>
      </div>
      <span className="break-all text-xs lg:text-sm">{user.email}</span>
      <RoleList labels={roleLabels} />
      <span className="text-xs lg:text-sm">{branch?.name || "All branches"}</span>
      <Badge tone={user.is_active ? "green" : "red"} className="rounded-full text-xs lg:text-sm py-1 px-1">
        {user.is_active ? "Active" : "Inactive"}
      </Badge>
      <span className="text-xs lg:text-sm">{formatDate(user.created_at)}</span>
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
      className="md:grid-cols-[1.15fr_.75fr_1.2fr_.65fr_1.45fr]"
    >
      <div>
        <b className="text-xs lg:text-sm">{role.name}</b>
        {isLocked(role) && (
          <span className="ml-2">
            <Badge tone="purple" className="rounded-full text-xs py-1 px-0 w-[30%]">Locked</Badge>
          </span>
        )}
      </div>
      <span className="text-xs lg:text-sm">{roleKeyLabel(role.key)}</span>
      <Badge tone={role.is_active ? "green" : "red"} className="rounded-full px-1 py-1 text-xs lg:text-sm w-[40%]">
        {role.is_active ? "Active" : "Inactive"}
      </Badge>
      <span className="text-xs lg:text-sm">{formatDate(role.updated_at || role.created_at)}</span>
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
      className="md:grid-cols-[1.15fr_.75fr_1.2fr_.65fr_1.45fr]"
    >
      <div>
        <b className="text-xs lg:text-sm">{department.name}</b>
        {department.locked && (
          <span className="ml-2">
            <Badge tone="purple">Locked</Badge>
          </span>
        )}
        <p className="text-xs lg:text-sm text-slate-500">
          {department.rows?.length > 1
            ? `${department.rows.length} branch mappings`
            : "Single branch mapping"}
        </p>
      </div>
      <span className="text-xs lg:text-sm">{department.code}</span>
      <span className="text-xs lg:text-sm">{department.branch_names || "All branches"}</span>
      <Badge tone={department.is_active ? "green" : "red"} className="text-xs lg:text-sm rounded-full py-1">
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
      className="md:grid-cols-[1.15fr_.75fr_1.2fr_.65fr_1.45fr]"
    >
      <div>
        <b className="text-xs lg:text-sm">{branch.name}</b>
        {isLocked(branch) && (
          <span className="ml-2">
            <Badge tone="purple">Locked</Badge>
          </span>
        )}
      </div>
      <span className="text-xs lg:text-sm">{branch.code}</span>
      <span className="text-xs lg:text-sm">
        {[branch.area, branch.city, branch.state].filter(Boolean).join(", ") ||
          "-"}
      </span>
      <Badge tone={branch.is_active ? "green" : "red"} className="text-xs lg:text-sm rounded-full py-1">
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
      className="md:grid-cols-[1.15fr_.75fr_1.2fr_.65fr_1.45fr]"
    >
      <div>
        <b className="text-xs lg:text-sm">{supplier.name}</b>
      </div>
      <span className="text-xs lg:text-sm">{supplier.gstin || "-"}</span>
      <span>
        <b className="text-xs lg:text-sm">{supplier.phone || "-"}</b>
        <p className="break-all text-xs text-slate-500">
          {supplier.email || supplier.address || "-"}
        </p>
      </span>
      <Badge tone={supplier.is_active ? "green" : "red"} className="text-xs lg:text-sm rounded-full py-1">
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
      className="md:grid-cols-[1.15fr_.75fr_1.2fr_.65fr_1.45fr]"
    >
      <div>
        <b className="text-xs lg:text-sm">{rule.name}</b>
      </div>
      <span className="text-xs lg:text-sm">
        {scopeLabel(rule.service_scope)} · {branch?.name || "All branches"}
      </span>
      <span>
        <b className="text-xs lg:text-sm">{rule.tax_percentage}%</b>
        <p className="text-xs text-slate-500">{rule.tax_label || "GST"}</p>
      </span>
      <Badge tone={rule.is_active ? "green" : "red"} className="text-xs lg:text-sm rounded-full py-1">
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
      className="md:grid-cols-[1.15fr_.75fr_1.2fr_.65fr_1.45fr]"
    >
      <div>
        <b className="text-xs lg:text-sm">{offer.name}</b>
        {code && <p className="break-all text-xs text-slate-500">{code}</p>}
      </div>
      <span className="text-xs lg:text-sm">
        {scopeLabel(offer.service_scope)} · {branch?.name || "All branches"}
      </span>
      <span>
        <b className="text-xs lg:text-sm">{value}</b>
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
      <Badge tone={offer.is_active ? "green" : "red"} className="text-xs lg:text-sm rounded-full py-1">
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
