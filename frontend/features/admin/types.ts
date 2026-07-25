export type Column = {
  label: string;
  width: string;
};


export type NoticeTone = "success" | "warning" | "delete" | "info" | "error";

export type SearchableOption = {
  value: string;
  label: string;
  sublabel?: string;
};

export type SearchableSelectProps<T = string> = {
  name?: string;
  value?: T;
  onChange?: (value: T) => void;
  options: SearchableOption[];
  placeholder?: string;
  disabled?: boolean;
  allowCustom?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  maxOptions?: number;
  className?: string;
  searchable?: boolean;
  required?: boolean;
  error?: string;
  loading?: boolean;
  onSearchChange?: (query: string) => void;
};


export type Action = {
  label: string;
  onClick: () => void;
  hidden?: boolean;
  disabled?: boolean;
  danger?: boolean;
};

export type RowActionsProps = {
  actions: Action[];
  className?: string;
  width?:string
};

export type Role = {
  id: string;
  name: string;
  key: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};
