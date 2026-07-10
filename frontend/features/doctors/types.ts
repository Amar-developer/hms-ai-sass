export type CheckboxGroupProps = {
  title: string;
  rows: any[];
  value: string[];
  onChange: (value: string[]) => void;
  empty?: string;
  allLabel?: string;
};
