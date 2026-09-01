import { Pagination } from "@/app/components/common/Pagination";
import { DataTable } from "@/app/components/common/DataTable";
import { getBookingListColumn } from "../Column";
import { HeartPulse } from "lucide-react";

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
  onView,
  onEdit,
  onInvoice,
  canManage = false,
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
    <div>
      <div className="overflow-x-auto scrollbar-hidden">
        <div className="min-w-[980px]">
          <DataTable
            columns={bookingColumns}
            data={bookings}
            loading={loading}
            emptyMessage="No home care / visit bookings match your filter."
            emptyDescription="Home care and visit bookings created for patients will show up here."
            emptyIcon={HeartPulse}
            minBodyHeight={`${bookings.length > 0 ?'':'220px'}`}
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
    </div>
  );
}
