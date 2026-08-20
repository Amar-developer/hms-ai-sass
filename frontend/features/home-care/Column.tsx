import { RecordIdCell } from "@/app/components/common/RecordIdCell";
import {
  capitalizeFirst,
  displayDate,
  money,
  patientName,
} from "@/utils/helper";
import { Column } from "@/utils/types";
import { PatientFlagBadges } from "../patients/components/PatientFlagBadges";
import { bookingStaffName, bookingTotal, isBookingLocked } from "./helpers";
import { humanizeOptionLabel } from "@/lib/options";
import { RowActions } from "../admin/components/RowActions";
import { Badge } from "@/app/components/common/ui";

type getBookingListColumnProps = {
  canCopyIds: boolean;
  patientMap: Map<string, any>;
  staffMap: Map<string, any>;
  onView: (booking: any) => void;
  onEdit: (booking: any) => void;
  canManage: boolean;
  onInvoice: (booking: any) => void;
};

export function getBookingListColumn({
  canCopyIds,
  patientMap,
  staffMap,
  onView,
  onEdit,
  canManage,
  onInvoice,
}: getBookingListColumnProps): Column<any>[] {
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
      key: "booking_number",
      header: "Booking ID",
      width: "180px",
      sortable: true,
      render: (booking: any) => (
        <div>
          <RecordIdCell
            id={booking.id}
            label="Home Care Booking ID"
            allowed={canCopyIds}
            value={booking.booking_number}
            valueClassName="text-sm"
          />
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "text-center",
      width: "120px",
      sortable: true,
      render: (booking: any) => {
        return (
          <Badge
            className="normal-label"
            tone={`${String(
              booking.status == "requested"
                ? "orange"
                : booking.status == "paid"
                  ? "green"
                  : booking.status == "invoiced"
                    ? "skyblue"
                    : booking.status == "scheduled"
                      ? "purple"
                      : booking.status == "in_progress"
                        ? "blue"
                        : booking.status == "completed"
                          ? "amber"
                          : booking.status == "cancelled"
                            ? "red"
                            : "",
            )}`}
          >
            {humanizeOptionLabel(booking.status)}
          </Badge>
        );
      },
    },
    {
      key: "patient",
      header: "Patient",
      width: "160px",
      sortable: true,
      render: (booking: any) => {
        const patient: any = patientMap.get(booking.patient_id);
        return (
          <div className="max-w-[150px]">
            <p
              className="truncate font-semibold"
              title={capitalizeFirst(
                booking.patient_name || patientName(patient),
              )}
            >
              {capitalizeFirst(booking.patient_name || patientName(patient))}
            </p>
            <PatientFlagBadges patient={patient} className="mt-1" />
          </div>
        );
      },
    },
    {
      key: "staff",
      header: "Staff",
      width: "160px",
      render: (booking: any) => (
        <div className="max-w-[150px] ">
          <div className="truncate" title={bookingStaffName(booking, staffMap)}>
            {bookingStaffName(booking, staffMap)}
            {booking.staff_type && (
              <p className="text-xs text-slate-500">
                {humanizeOptionLabel(booking.staff_type)}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "date_range",
      header: "Date Range",
      width: "220px",
      sortable: true,
      render: (booking: any) => (
        <div className="text-sm">
          {displayDate(booking.start_date)} to {displayDate(booking.end_date)}
        </div>
      ),
    },

    {
      key: "total",
      header: "Total",
      width: "120px",
      className: "text-center",
      cellClassName: "text-center",
      sortable: true,
      render: (booking: any) => money(bookingTotal(booking)),
    },
    {
      key: "actions",
      header: "Actions",
      width: "100px",
      className: "text-center",
      cellClassName: "text-center",
      disableRowClick: true,
      render: (booking: any) => (
        <div className="flex justify-center">
          <RowActions
            actions={[
              ...(canManage
                ? [
                    {
                      label: "Edit",
                      onClick: () => onEdit(booking),
                      disabled: isBookingLocked(booking),
                    },
                  ]
                : []),
              {
                label: "Invoice",
                onClick: () => onInvoice(booking),
              },
            ]}
            className="right-8 -bottom-5"
          />
        </div>
      ),
    },
  ];
}
