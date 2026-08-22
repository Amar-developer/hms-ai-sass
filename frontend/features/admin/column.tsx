import { humanizeOptionLabel } from "@/lib/options";
import { capitalizeFirst, displayDateTime } from "@/utils/helper";
import {
  patientLabel,
  userRoleLabels,
  formatDate,
  isLocked,
  roleKeyLabel,
  scopeLabel,
} from "./helpers";
import { uploadAssetUrl } from "@/lib/api";
import { RowActions } from "./components/RowActions";
import { RoleList } from "./components/RoleList";
import { Badge } from "@/app/components/common/ui";
import { CopyIdButton } from "@/app/components/common/CopyIdButton";

function rowActions({
  onEdit,
  onStatus,
  onDelete,
  canEdit,
  canDelete,
  editLabel = "Edit",
  hideStatus = false,
  hideDelete = false,
  isActive,
}: {
  onEdit?: () => void;
  onStatus?: () => void;
  onDelete?: () => void;
  canEdit: boolean;
  canDelete: boolean;
  editLabel?: string;
  hideStatus?: boolean;
  hideDelete?: boolean;
  isActive: boolean;
}) {
  return [
    { label: editLabel, onClick: onEdit, hidden: !onEdit || !canEdit },
    {
      label: isActive ? "Inactive" : "Active",
      onClick: onStatus,
      hidden: hideStatus || !onStatus || !canEdit,
    },
    {
      label: "Delete",
      onClick: onDelete,
      hidden: hideDelete || !onDelete || !canDelete,
      danger: true,
    },
  ];
}

interface ConfirmDeleteState {
  kind: string;
  entity: string;
  file: any;
}
interface GetFileColumnProps {
  busy: boolean;
  setConfirmDelete: ({ kind, entity, file }: ConfirmDeleteState) => void;
  patients: any[];
}
export function getFileColumns({
  busy,
  setConfirmDelete,
  patients,
}: GetFileColumnProps) {
  return [
    {
      key: "s.no",
      header: "S.No",
      width: "50px",
      className: "text-center",
      cellClassName: "text-center",
      sortable: true,
      render: (_, index: number) => index + 1,
    },
    {
      key: "file_name",
      header: "File",
      width: "200px",
      render: (file: any) => (
        <div className="max-w-[200px]">
          <p className="font-bold truncate text-xs" title={file?.file_name}>
            {capitalizeFirst(file.file_name)}
          </p>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      width: "120px",
      render: (file: any) => (
        <Badge tone="blue" className="normal-badge">
          {humanizeOptionLabel(file.category)}
        </Badge>
      ),
    },
    {
      key: "attached_to_doctype",
      header: "Attached To",
      render: (file: any) => (
        <div className="text-xs">{file.attached_to_doctype || "-"}</div>
      ),
    },
    {
      key: "patient_id",
      header: "Patient",
      render: (file: any) => (
        <div className="text-xs">{patientLabel(patients, file.patient_id)}</div>
      ),
    },
    {
      key: "created_at",
      header: "Created",
      render: (file: any) => (
        <div className="text-xs">
          {file.created_at ? displayDateTime(file.created_at) : "-"}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "100px",
      disableRowClick: true,
      render: (file: any) => {
        const actions = [
          {
            label: "Open",
            onClick: () =>
              window.open(
                uploadAssetUrl(file.file_url),
                "_blank",
                "noopener,noreferrer",
              ),
          },
          {
            label: "Delete",
            danger: true,
            disabled: busy,
            onClick: () =>
              setConfirmDelete({ kind: "delete", entity: "file", file }),
          },
        ];

        return <RowActions actions={actions} className="right-5 -bottom-7" />;
      },
    },
  ];
}

interface GetReportJobsColumnProps {
  safeReportPage: number;
  pageSize: number;
  reportBusy: string;
  resendMonthlyReport: (job: any) => void;
  downloadMonthlyReport: (job: any) => void;
}
export function getReportJobsColumns({
  safeReportPage,
  pageSize,
  reportBusy,
  resendMonthlyReport,
  downloadMonthlyReport,
}: GetReportJobsColumnProps) {
  return [
    {
      key: "job",
      header: "Job",
      render: (job: any, index: number) => (
        <b>Report {(safeReportPage - 1) * pageSize + index + 1}</b>
      ),
    },
    {
      key: "created_at",
      header: "Time",
      render: (job: any) => (
        <p className="text-xs text-slate-500">
          {displayDateTime(job.created_at)}
        </p>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "100px",
      render: (job: any) => (
        <Badge
          tone={
            job.status === "sent"
              ? "green"
              : job.status === "failed"
                ? "red"
                : job.status === "running"
                  ? "blue"
                  : "amber"
          }
          className="normal-badge w-[60%] text-xs"
        >
          {humanizeOptionLabel(job.status)}
        </Badge>
      ),
    },
    {
      key: "period",
      header: "Period",
      render: (job: any) => (
        <span className="text-xs">
          {job.period_start} to {job.period_end}
        </span>
      ),
    },
    {
      key: "recipients",
      header: "Recipients",
      render: (job: any) => (
        <span className="text-xs truncate">
          {(job.recipients || []).join(", ")}
        </span>
      ),
    },
    {
      key: "result",
      header: "Result",
      render: (job: any) => (
        <div
          className="truncate w-[100px] text-xs text-slate-500"
          title={job.failure_reason || job.attachment_filename}
        >
          {job.failure_reason || job.attachment_filename || "-"}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      disableRowClick: true,
      render: (job: any) => (
        <RowActions
          actions={[
            {
              label:
                reportBusy === `resend-${job.id}` ? "Sending..." : "Resend",
              onClick: () => resendMonthlyReport(job),
              disabled: reportBusy === `resend-${job.id}`,
            },
            {
              label:
                reportBusy === `download-${job.id}`
                  ? "Downloading..."
                  : "Download",
              onClick: () => downloadMonthlyReport(job),
              disabled: reportBusy === `download-${job.id}`,
            },
          ]}
          className="right-24 -bottom-3"
          width="w-24"
        />
      ),
    },
  ];
}

interface RowActionCallbacks {
  canEdit?: boolean;
  canDelete?: boolean;
  onEdit: (row: any) => void;
  onStatus: (row: any) => void;
  onDelete: (row: any) => void;
}

interface GetUserColumnsProps extends RowActionCallbacks {
  roles: any[];
  branches: any[];
  canCopyIds?: boolean;
}
export function getUserColumns({
  roles,
  branches,
  canCopyIds = false,
  canEdit = true,
  canDelete = true,
  onEdit,
  onStatus,
  onDelete,
}: GetUserColumnsProps) {
  return [
    {
      key: "s.no",
      header: "S.No",
      width: "50px",
      className: "text-center",
      cellClassName: "text-center",
      render: (_: any, index: number) => index + 1,
    },
    {
      key: "name",
      header: "Name",
      width: "180px",
      render: (user: any) => (
        <div className="max-w-[170px] flex items-center gap-2">
          <p className="truncate font-bold">{user.name}</p>
          <CopyIdButton value={user.id} label="User ID" allowed={canCopyIds} />
        </div>
      ),
    },
    {
      key: "is_active",
      header: "Status",
      width: "120px",
      render: (user: any) => (
        <Badge tone={user.is_active ? "green" : "red"} className="normal-label">
          {user.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "roles",
      header: "Roles",
      width: "120px",
      render: (user: any) => (
        <RoleList labels={userRoleLabels(user, roles)} />
      ),
    },
    {
      key: "email",
      header: "Email",
      width: "200px",
      render: (user: any) => (
        <div className="max-w-[190px]">
          <p className="truncate" title={user.email}>{user.email}</p>
        </div>
      ),
    },
    {
      key: "branch_id",
      header: "Branch",
      width: "180px",
      render: (user: any) =>
        branches.find((b: any) => b.id === user.branch_id)?.name ??
        "All branches",
    },
    {
      key: "actions",
      header: "Actions",
      width: "100px",
      disableRowClick: true,
      render: (user: any) => (
        <RowActions
          className="right-16 -bottom-5"
          actions={rowActions({
            onEdit: () => onEdit(user),
            onStatus: () => onStatus(user),
            onDelete: () => onDelete(user),
            canEdit,
            canDelete,
            isActive: user.is_active,
          })}
        />
      ),
    },
  ];
}

interface GetRoleColumnsProps extends RowActionCallbacks {
  canCopyIds?: boolean;
}
export function getRoleColumns({
  canCopyIds = false,
  canEdit = true,
  canDelete = true,
  onEdit,
  onStatus,
  onDelete,
}: GetRoleColumnsProps) {
  return [
    {
      key: "s.no",
      header: "S.No",
      width: "50px",
      className: "text-center",
      cellClassName: "text-center",
      render: (_: any, index: number) => index + 1,
    },
    {
      key: "name",
      header: "Role",
      width: "200px",
      render: (role: any) => (
        <div className="flex items-center gap-2">
          <span className="font-bold">{role.name}</span>
          <CopyIdButton value={role.id} label="Role ID" allowed={canCopyIds} />
          {isLocked(role) && (
            <Badge tone="purple" className="normal-label">
              Locked
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "key",
      header: "Key",
      width: "180px",
      render: (role: any) => roleKeyLabel(role.key),
    },
    {
      key: "permission_keys",
      header: "Permissions",
      width: "130px",
      render: (role: any) => (
        <Badge tone="slate" className="normal-label">
          {Array.isArray(role.permission_keys) ? role.permission_keys.length : 0}
        </Badge>
      ),
    },
    {
      key: "is_active",
      header: "Status",
      width: "140px",
      render: (role: any) => (
        <Badge tone={role.is_active ? "green" : "red"} className="normal-label">
          {role.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "updated_at",
      header: "Modified",
      width: "140px",
      render: (role: any) => formatDate(role.updated_at || role.created_at),
    },
    {
      key: "actions",
      header: "Actions",
      width: "100px",
      disableRowClick: true,
      render: (role: any) => {
        const locked = isLocked(role);
        return (
          <RowActions
            actions={rowActions({
              onEdit: () => onEdit(role),
              onStatus: () => onStatus(role),
              onDelete: () => onDelete(role),
              canEdit,
              canDelete,
              editLabel: locked ? "Permissions" : "Edit",
              hideStatus: locked,
              hideDelete: locked,
              isActive: role.is_active,
            })}
          />
        );
      },
    },
  ];
}

export function getDepartmentColumns({
  canEdit = true,
  canDelete = true,
  onEdit,
  onStatus,
  onDelete,
}: RowActionCallbacks) {
  return [
    {
      key: "s.no",
      header: "S.No",
      width: "50px",
      className: "text-center",
      cellClassName: "text-center",
      render: (_: any, index: number) => index + 1,
    },
    {
      key: "name",
      header: "Medical Department",
      width: "200px",
      render: (department: any) => (
        <div className="flex items-center gap-2">
          <span className="font-bold">{department.name}</span>
          {department.locked && <Badge tone="purple">Locked</Badge>}
        </div>
      ),
    },
    {
      key: "code",
      header: "Code",
      width: "160px",
      render: (department: any) => department.code,
    },
    {
      key: "branch_names",
      header: "Branches",
      width: "200px",
      render: (department: any) => department.branch_names || "All branches",
    },
    {
      key: "is_active",
      header: "Status",
      width: "120px",
      render: (department: any) => (
        <Badge
          tone={department.is_active ? "green" : "red"}
          className="normal-label"
        >
          {department.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "100px",
      disableRowClick: true,
      render: (department: any) => (
        <RowActions
          actions={rowActions({
            onEdit: () => onEdit(department),
            onStatus: () => onStatus(department),
            onDelete: () => onDelete(department),
            canEdit,
            canDelete,
            isActive: department.is_active,
          })}
        />
      ),
    },
  ];
}

interface GetBranchColumnsProps extends RowActionCallbacks {
  canCopyIds?: boolean;
}
export function getBranchColumns({
  canCopyIds = false,
  canEdit = true,
  canDelete = true,
  onEdit,
  onStatus,
  onDelete,
}: GetBranchColumnsProps) {
  return [
    {
      key: "s.no",
      header: "S.No",
      width: "50px",
      className: "text-center",
      cellClassName: "text-center",
      render: (_: any, index: number) => index + 1,
    },
    {
      key: "name",
      header: "Name",
      width: "200px",
      render: (branch: any) => (
        <div className="flex items-center gap-2">
          <span className="font-bold">{branch.name}</span>
          <CopyIdButton
            value={branch.id}
            label="Branch ID"
            allowed={canCopyIds}
          />
          {isLocked(branch) && (
            <Badge tone="purple" className="normal-label">
              Locked
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "code",
      header: "Code",
      width: "100px",
      render: (branch: any) => branch.code,
    },
    {
      key: "location",
      header: "Location",
      width: "260px",
      render: (branch: any) =>
        [branch.area, branch.city, branch.state].filter(Boolean).join(", ") ||
        "-",
    },
    {
      key: "is_active",
      header: "Status",
      width: "120px",
      render: (branch: any) => (
        <Badge tone={branch.is_active ? "green" : "red"} className="normal-label">
          {branch.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "100px",
      disableRowClick: true,
      render: (branch: any) => (
        <RowActions
          actions={rowActions({
            onEdit: () => onEdit(branch),
            onStatus: () => onStatus(branch),
            onDelete: () => onDelete(branch),
            canEdit,
            canDelete,
            isActive: branch.is_active,
          })}
        />
      ),
    },
  ];
}

export function getSupplierColumns({
  canEdit = true,
  canDelete = true,
  onEdit,
  onStatus,
  onDelete,
}: RowActionCallbacks) {
  return [
    {
      key: "s.no",
      header: "S.No",
      width: "50px",
      className: "text-center",
      cellClassName: "text-center",
      render: (_: any, index: number) => index + 1,
    },
    {
      key: "name",
      header: "Name",
      width: "220px",
      render: (supplier: any) => <b>{supplier.name}</b>,
    },
    {
      key: "gstin",
      header: "GSTIN",
      width: "160px",
      render: (supplier: any) => supplier.gstin || "-",
    },
    {
      key: "phone",
      header: "Contact",
      width: "260px",
      render: (supplier: any) => (
        <div>
          <b>{supplier.phone || "-"}</b>
          <p className="text-slate-500">
            {supplier.email || supplier.address || "-"}
          </p>
        </div>
      ),
    },
    {
      key: "is_active",
      header: "Status",
      width: "120px",
      render: (supplier: any) => (
        <Badge
          tone={supplier.is_active ? "green" : "red"}
          className="normal-label"
        >
          {supplier.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "100px",
      disableRowClick: true,
      render: (supplier: any) => (
        <RowActions
          actions={rowActions({
            onEdit: () => onEdit(supplier),
            onStatus: () => onStatus(supplier),
            onDelete: () => onDelete(supplier),
            canEdit,
            canDelete,
            isActive: supplier.is_active,
          })}
        />
      ),
    },
  ];
}

interface GetTaxRuleColumnsProps extends RowActionCallbacks {
  branches: any[];
}
export function getTaxRuleColumns({
  branches,
  canEdit = true,
  canDelete = true,
  onEdit,
  onStatus,
  onDelete,
}: GetTaxRuleColumnsProps) {
  return [
    {
      key: "s.no",
      header: "S.No",
      width: "50px",
      className: "text-center",
      cellClassName: "text-center",
      render: (_: any, index: number) => index + 1,
    },
    {
      key: "name",
      header: "Name",
      width: "180px",
      render: (rule: any) => <b>{rule.name}</b>,
    },
    {
      key: "service_scope",
      header: "Scope",
      width: "260px",
      render: (rule: any) => {
        const branch = branches.find((b: any) => b.id === rule.branch_id);
        return `${scopeLabel(rule.service_scope)} · ${
          branch?.name || "All branches"
        }`;
      },
    },
    {
      key: "tax_percentage",
      header: "Tax",
      width: "140px",
      render: (rule: any) => (
        <div>
          <b>{rule.tax_percentage}%</b>
          <p className="text-slate-500">{rule.tax_label || "GST"}</p>
        </div>
      ),
    },
    {
      key: "is_active",
      header: "Status",
      width: "120px",
      render: (rule: any) => (
        <Badge tone={rule.is_active ? "green" : "red"} className="normal-label">
          {rule.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "100px",
      disableRowClick: true,
      render: (rule: any) => (
        <RowActions
          actions={rowActions({
            onEdit: () => onEdit(rule),
            onStatus: () => onStatus(rule),
            onDelete: () => onDelete(rule),
            canEdit,
            canDelete,
            isActive: rule.is_active,
          })}
        />
      ),
    },
  ];
}

interface GetDiscountOfferColumnsProps extends RowActionCallbacks {
  branches: any[];
}
export function getDiscountOfferColumns({
  branches,
  canEdit = true,
  canDelete = true,
  onEdit,
  onStatus,
  onDelete,
}: GetDiscountOfferColumnsProps) {
  return [
    {
      key: "s.no",
      header: "S.No",
      width: "50px",
      className: "text-center",
      cellClassName: "text-center",
      render: (_: any, index: number) => index + 1,
    },
    {
      key: "name",
      header: "Offer",
      width: "140px",
      render: (offer: any) => <b>{offer.name}</b>,
    },
    {
      key: "service_scope",
      header: "Scope",
      width: "260px",
      render: (offer: any) => {
        const branch = branches.find((b: any) => b.id === offer.branch_id);
        return `${scopeLabel(offer.service_scope)} · ${
          branch?.name || "All branches"
        }`;
      },
    },
    {
      key: "value",
      header: "Value",
      width: "200px",
      render: (offer: any) => {
        const value =
          offer.discount_type === "fixed"
            ? `₹${Number(offer.value || 0).toLocaleString("en-IN")}`
            : `${offer.value}%`;
        const minimum = Number(offer.minimum_bill_amount || 0);
        return (
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
        );
      },
    },
    {
      key: "is_active",
      header: "Status",
      width: "100px",
      render: (offer: any) => (
        <Badge tone={offer.is_active ? "green" : "red"} className="normal-label">
          {offer.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "100px",
      disableRowClick: true,
      render: (offer: any) => (
        <RowActions
          actions={rowActions({
            onEdit: () => onEdit(offer),
            onStatus: () => onStatus(offer),
            onDelete: () => onDelete(offer),
            canEdit,
            canDelete,
            isActive: offer.is_active,
          })}
        />
      ),
    },
  ];
}
