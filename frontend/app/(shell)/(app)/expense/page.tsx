"use client";

import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";
import Expense from "@/features/expenses/Expenses";

export default function ExpenseFlowPage() {
  const ctx = useWorkspace();
  const { navigatePage } = useShellChrome();
  return <Expense {...ctx}  setActive={navigatePage} />
}
