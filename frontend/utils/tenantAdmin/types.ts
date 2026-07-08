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
};
