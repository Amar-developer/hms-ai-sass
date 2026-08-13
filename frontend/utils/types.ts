export type Column<T> = {
  key: keyof T | string;
  header: string;
  width?: string;
  className?: string;
  cellClassName?: string;
  render?: (row: T, index: number) => React.ReactNode;
  disableRowClick?: boolean;
  sortable?: boolean;
};

export type SortState = {
  key: string;
  dir: "asc" | "desc";
};

export type DataTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  className?: string;
  onRowClick?: (row: T) => void;
  footer?: React.ReactNode;
  paginate?: boolean;
  pageSize?: number;
  loading?: boolean;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
};
