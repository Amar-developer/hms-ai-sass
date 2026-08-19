import { humanizeOptionLabel } from "@/lib/options";
import { capitalizeFirst, displayDateTime } from "@/utils/helper";
import { patientLabel } from "./helpers";
import { uploadAssetUrl } from "@/lib/api";
import { RowActions } from "./components/RowActions";
import { Badge } from "@/app/components/common/ui";

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
