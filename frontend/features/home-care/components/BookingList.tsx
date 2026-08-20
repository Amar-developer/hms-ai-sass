import { Card, Button, Badge } from "@/app/components/common/ui";
import {
  capitalizeFirst,
  displayDate,
  money,
  patientName,
} from "@/utils/helper";
import { bookingTotal, isBookingLocked, bookingStaffName } from "../helpers";
import { humanizeOptionLabel } from "@/lib/options";
import { Pagination } from "@/app/components/common/Pagination";
import { CopyIdButton } from "@/app/components/common/CopyIdButton";
import { RowActions } from "@/features/admin/components/RowActions";
import { DataTable } from "@/app/components/common/DataTable";
import { Column } from "@/utils/types";
import { PatientFlagBadges } from "@/features/patients/components/PatientFlagBadges";
import { getBookingListColumn } from "../Column";

export function BookingsList({
  bookings,
  total,
  page,
  totalPages,
  onPage,
  sort,
  onSortChange,
  patientMap,
  staffMap,
  loading = false,
  onCreate,
  onView,
  onEdit,
  onInvoice,
  canManage = false,
  canCreate = false,
  canCopyIds = false,
}: any) {
  const bookingColumns = getBookingListColumn({
    canCopyIds,
    patientMap,
    staffMap,
    onView,
    onEdit,
    canManage,
    onInvoice,
  });
  return (
    <Card className="p-0">
      <div className="flex flex-col gap-3  lg:items-end lg:justify-between">
        <div className=" w-full flex justify-between">
          <div>
            {" "}
            <h3 className="card-title font-bold">Home Care / Visit Booking</h3>
            <p className="card-desc text-slate-500">
              Create patient-linked home care and visit bookings. bookings.
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {canCreate && (
              <Button type="button" onClick={onCreate} className="save-button">
                New Booking
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto scrollbar-hidden rounded-2xl border border-slate-200">
        <div className="min-w-[980px] ">
          <DataTable
            columns={bookingColumns}
            data={bookings}
            loading={loading}
            emptyMessage="No home care / visit bookings match your filter."
            onRowClick={(booking: any) => onView(booking)}
            sort={sort ?? undefined}
            onSortChange={onSortChange}
          />
        </div>
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        onPage={onPage}
      />
    </Card>
  );
}
