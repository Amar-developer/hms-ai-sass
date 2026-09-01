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
  // Opt-in richer empty state: passing either makes the empty-state cell
  // render as a centered icon+message block instead of the plain text row,
  // and minBodyHeight also keeps the table area from collapsing when empty.
  emptyDescription?: string;
  emptyIcon?: React.ComponentType<{ className?: string }>;
  minBodyHeight?: string;
  className?: string;
  tableClassName?: string;
  rowClassName?: string | ((row: T, index: number) => string);
  onRowClick?: (row: T) => void;
  footer?: React.ReactNode;
  paginate?: boolean;
  pageSize?: number;
  loading?: boolean;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
};
