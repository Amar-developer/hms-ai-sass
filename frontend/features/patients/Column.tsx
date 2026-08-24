import { capitalizeFirst, money } from "@/utils/helper";
import { Badge } from "@/app/components/common/ui";
import { RecordIdCell } from "@/app/components/common/RecordIdCell";
import { RowActions } from "@/features/admin/components/RowActions";
import { Column } from "@/utils/types";
import { displayPatientGender, patientDisplayMobile, fmtDate } from "./helpers";
import { PatientFlagBadges } from "./components/PatientFlagBadges";
import { StatusBadge } from "./components/StatusBadge";
import {
  invoicePatientDueAmount,
  invoiceSource,
} from "@/features/billing/helpers";

type PatientColumnsParams = {
  branches: any[];
  canCopyIds: boolean;
  canEditPatient: boolean;
  canDeletePatient: boolean;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (row: any) => void;
  onActivate: (row: any) => void;
};

export function getPatientColumns({
  branches,
  canCopyIds,
  canEditPatient,
  canDeletePatient,
  onView,
  onEdit,
  onDelete,
  onActivate,
}: PatientColumnsParams): Column<any>[] {
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
      key: "full_name",
      header: "Patient",
      width: "200px",
      sortable: true,
      render: (row: any) => (
        <div className="min-w-0">
          <RecordIdCell
            id={row.id}
            label="Patient ID"
            allowed={canCopyIds}
            value={capitalizeFirst(row.full_name)}
            valueClassName="text-sm text-slate-950"
          />

          <PatientFlagBadges patient={row} className="mt-1.5" maxVisible={3} />
        </div>
      ),
    },
    {
      key: "patient_number",
      header: "Number",
      width: "150px",
      sortable: true,
      render: (row: any) => <p className="">{row.patient_number}</p>,
    },
    {
      key: "mobile",
      header: "Mobile",
      width: "150px",
      render: (row: any) => (
        <span className="block truncate text-sm text-slate-700">
          {patientDisplayMobile(row) || "-"}
        </span>
      ),
    },
    {
      key: "branch_id",
      header: "Branch",
      width: "170px",
      sortable: true,
      render: (row: any) => {
        const branch = branches.find((item: any) => item.id === row.branch_id);
        return (
          <span className="block truncate text-sm text-slate-700">
            {branch?.name || "No branch"}
          </span>
        );
      },
    },
    {
      key: "gender",
      header: "Gender / Age",
      width: "130px",
      sortable: true,
      render: (row: any) => (
        <span className="text-sm text-slate-700">
          {displayPatientGender(row.gender)} / {row.age_years ?? "-"}
        </span>
      ),
    },
    {
      key: "subscription_plan_name",
      header: "Plan",
      width: "160px",
      render: (row: any) =>
        row.subscription_plan_name ? (
          <span className="block truncate text-sm text-slate-700">
            {row.subscription_plan_name}
          </span>
        ) : (
          <span className="text-sm text-slate-400">-</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      width: "100px",
      className: "text-center",
      cellClassName: "text-center",
      sortable: true,
      render: (row: any) => (
        <Badge
          tone={
            row.status === "active"
              ? "green"
              : row.status === "deceased"
                ? "purple"
                : "red"
          }
         className="normal-label"
        >
          {row.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "110px",
      className: "text-center",
      cellClassName: "text-center",
      disableRowClick: true,
      render: (row: any) => (
        <div className="flex justify-center">
          <RowActions
            actions={[
              {
                label: "Edit",
                onClick: () => onEdit(row.id),
                hidden: !canEditPatient,
              },
              {
                label: "Delete",
                onClick: () => onDelete(row),
                hidden: !canDeletePatient || row.status !== "active",
                danger: true,
              },
              {
                label: "Activate",
                onClick: () => onActivate(row),
                hidden: !canEditPatient || row.status !== "inactive",
              },
            ]}
            className="right-7 -bottom-5"
          />
        </div>
      ),
    },
  ];
}

export function getConsultationColumns({
  onOpen,
}: {
  onOpen: (row: any) => void;
}): Column<any>[] {
  return [
    {
      key: "created_at",
      header: "Date",
      render: (row: any) => (
        <span className="font-black text-slate-950">
          {fmtDate(row.created_at)}
        </span>
      ),
    },
    {
      key: "treatment_type",
      header: "Type",
      render: (row: any) => (
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold capitalize text-slate-700">
          {String(row.treatment_type || "consultation").replaceAll("_", " ")}
        </span>
      ),
    },
    {
      key: "summary",
      header: "Summary",
      render: (row: any) => (
        <span className="line-clamp-1">
          {row.chief_complaint ||
            row.diagnosis ||
            row.patient_remarks ||
            row.clinical_notes ||
            "Consultation record"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "text-center",
      width: "150px",
      render: (row: any) => <StatusBadge status={row.status} />,
    },
    {
      key: "action",
      header: "Action",
      cellClassName: "text-left",
      disableRowClick: true,
      render: (row: any) => (
        <button
          type="button"
          onClick={() => onOpen(row)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:border-slate-900 hover:bg-white"
        >
          Open
        </button>
      ),
    },
  ];
}

export function getInvoiceColumns({
  onOpen,
}: {
  onOpen: (row: any) => void;
}): Column<any>[] {
  return [
    {
      key: "invoice_number",
      header: "Invoice",
      render: (row: any) => (
        <span className="font-black">{row.invoice_number}</span>
      ),
    },
    {
      key: "source",
      header: "Source",
      render: (row: any) => (
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase">
          {invoiceSource(row).label}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row: any) => String(row.status || "").replaceAll("_", " "),
    },
    {
      key: "total_amount",
      header: "Total",
      cellClassName: "text-left",
      render: (row: any) => money(row.total_amount),
    },
    {
      key: "paid_amount",
      header: "Paid",
      cellClassName: "text-left",
      render: (row: any) => money(row.paid_amount),
    },
    {
      key: "balance_amount",
      header: "Due",
      cellClassName: "text-left",
      render: (row: any) => money(invoicePatientDueAmount(row)),
    },
  ];
}

// Labs and medicines both come in as `{ row, items }` bundles — one order/
// issue per row, with its own line items grouped underneath.
export function getLabOrderColumns({
  onOpen,
}: {
  onOpen: (row: any) => void;
}): Column<any>[] {
  return [
    {
      key: "date",
      header: "Date",
      render: ({ row: order }: any) => (
        <span className="font-black text-slate-950">
          {fmtDate(order.created_at)}
        </span>
      ),
    },
    {
      key: "tests",
      header: "Tests",
      className: "text-right",
      cellClassName: "text-right",
      render: ({ items }: any) => (
        <span className="text-xs font-semibold text-slate-500">
          {items.length} test(s)
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: ({ row: order }: any) => <StatusBadge status={order.status} />,
    },
    {
      key: "action",
      header: "Action",
      className: "text-right",
      cellClassName: "text-right",
      disableRowClick: true,
      render: ({ row: order }: any) => (
        <button
          type="button"
          onClick={() => onOpen(order)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:border-slate-900 hover:bg-white"
        >
          Open
        </button>
      ),
    },
  ];
}

export function getMedicineColumns({
  onOpen,
}: {
  onOpen: (row: any) => void;
}): Column<any>[] {
  return [
    {
      key: "date",
      header: "Date",
      render: ({ row: issue }: any) => (
        <span className="font-black text-slate-950">
          {fmtDate(issue.created_at)}
        </span>
      ),
    },
    {
      key: "items",
      header: "Items",
      className: "text-right",
      cellClassName: "text-right",
      render: ({ items }: any) => (
        <span className="text-xs font-semibold text-slate-500">
          {items.length} item(s)
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: ({ row: issue }: any) => <StatusBadge status={issue.status} />,
    },
    {
      key: "action",
      header: "Action",
      className: "text-right",
      cellClassName: "text-right",
      disableRowClick: true,
      render: ({ row: issue }: any) => (
        <button
          type="button"
          onClick={() => onOpen(issue)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:border-slate-900 hover:bg-white"
        >
          Open
        </button>
      ),
    },
  ];
}
