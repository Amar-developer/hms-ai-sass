"use client";

import type { ReactNode } from "react";
import { AdminDataProvider } from "@/features/admin/AdminDataContext";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminDataProvider>{children}</AdminDataProvider>;
}
