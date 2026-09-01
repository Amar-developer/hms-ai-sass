"use client";

import { X } from "lucide-react";
import { Input, Button } from "./ui";
import { FormField } from "../FormElements";
import React from "react";

export type FilterFieldOption = {
  value: string;
  label: string;
};

export type FilterFieldSchema = {
  key: string;
  label: string;
  options: FilterFieldOption[];
};

export type SortFieldSchema = {
  key: string;
  label: string;
};

export type TableSchema = {
  id: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  filters: FilterFieldSchema[];
  sortFields: SortFieldSchema[];
};

type AdaptiveFilterBarProps = {
  schema: TableSchema;
  query?: string;
  setQuery?: (value: string) => void;
  showSearch?: boolean;
  onReset?: () => void;
  onClose?: () => void;
  className?: string;
  children?: React.ReactNode;
};

export function AdaptiveFilterBar({
  schema,
  query,
  setQuery,
  showSearch = true,
  className = "lg:grid-cols-4 xl:grid-cols-5",
  children,
  onReset,
  onClose,
}: AdaptiveFilterBarProps) {
  function handleReset() {
    // Search only — fixed dropdown filters and sort no longer live in this
    // panel, and ad-hoc query filters have their own dedicated "Clear".
    setQuery?.("");
    onReset?.();
  }

  return (
    <div className="flex flex-col ">
      <div className="flex justify-end cursor-pointer">
        <X size={18} onClick={() => onClose?.()} />
      </div>
      <div
        key={schema.id}
        className={`grid gap-3 ${children ? 'grid-cols-[1fr_0.6fr_0.3fr]':'grid-cols-[3fr_.6fr]'} ${className}`}
      >
        {showSearch && (
          <FormField label={schema.searchLabel ?? "Search"}>
            <Input
              value={query}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setQuery?.(e.target.value)
              }
              placeholder={schema.searchPlaceholder ?? "Search"}
            />
          </FormField>
        )}

        {children}

        <FormField label="">
          <Button
            type="button"
            onClick={handleReset}
            className="px-2 py-2 mt-4 text-xs"
          >
            Reset
          </Button>
        </FormField>
      </div>
    </div>
  );
}
