import { useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as expensesApi from "./expenses.api";

export type ExpenseSubcategoryConfigPayload = {
  category: string;
  name: string;
  default_amount: number | null;
  requires_quantity: boolean;
};

export function useExpenseSubcategoryActions(
  apiSession: ApiSession | null | undefined,
  reload: () => Promise<void> | void,
) {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function createExpenseSubcategoryConfig(
    payload: ExpenseSubcategoryConfigPayload,
  ) {
    if (!apiSession) return false;
    setBusy("create");
    setMessage("");
    try {
      await expensesApi.createExpenseSubcategoryConfig(apiSession, payload);
      await reload();
      setMessage("Subcategory created.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not create subcategory.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function updateExpenseSubcategoryConfig(
    subcategoryId: string,
    payload: Partial<ExpenseSubcategoryConfigPayload> & { is_active?: boolean },
  ) {
    if (!apiSession) return false;
    setBusy(`update-${subcategoryId}`);
    setMessage("");
    try {
      await expensesApi.updateExpenseSubcategoryConfig(
        apiSession,
        subcategoryId,
        payload,
      );
      await reload();
      setMessage("Subcategory updated.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not update subcategory.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function deleteExpenseSubcategoryConfig(subcategoryId: string) {
    if (!apiSession) return false;
    setBusy(`delete-${subcategoryId}`);
    setMessage("");
    try {
      await expensesApi.deleteExpenseSubcategoryConfig(apiSession, subcategoryId);
      await reload();
      setMessage("Subcategory deactivated.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not deactivate subcategory.");
      return false;
    } finally {
      setBusy("");
    }
  }

  return {
    busy,
    message,
    setMessage,
    createExpenseSubcategoryConfig,
    updateExpenseSubcategoryConfig,
    deleteExpenseSubcategoryConfig,
  };
}
