import { useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as expensesApi from "./expenses.api";

export type ExpenseCreatePayload = {
  branch_id: string | null;
  category: string;
  subcategory: string;
  amount: number;
  currency: string;
  incurred_on: string;
  description: string;
  quantity?: number | null;
};

export function useExpenseActions(
  apiSession: ApiSession | null | undefined,
  reload: () => Promise<void> | void,
) {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function createExpense(payload: ExpenseCreatePayload) {
    if (!apiSession) return false;
    setBusy("create");
    setMessage("");
    try {
      await expensesApi.createExpense(apiSession, payload);
      await reload();
      setMessage("Expense submitted for approval.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not submit expense.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function updateExpense(expenseId: string, payload: ExpenseCreatePayload) {
    if (!apiSession) return false;
    setBusy(`update-${expenseId}`);
    setMessage("");
    try {
      await expensesApi.updateExpense(apiSession, expenseId, payload);
      await reload();
      setMessage("Expense updated.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not update expense.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function attachReceipt(expenseId: string, receiptFileId: string) {
    if (!apiSession) return false;
    setBusy(`receipt-${expenseId}`);
    setMessage("");
    try {
      await expensesApi.attachExpenseReceipt(apiSession, expenseId, receiptFileId);
      await reload();
      setMessage("Receipt attached.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not attach receipt.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function approveExpense(expenseId: string) {
    if (!apiSession) return false;
    setBusy(`approve-${expenseId}`);
    setMessage("");
    try {
      await expensesApi.approveExpense(apiSession, expenseId);
      await reload();
      setMessage("Expense approved.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not approve expense.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function rejectExpense(expenseId: string, reason: string) {
    if (!apiSession) return false;
    setBusy(`reject-${expenseId}`);
    setMessage("");
    try {
      await expensesApi.rejectExpense(apiSession, expenseId, reason);
      await reload();
      setMessage("Expense rejected.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not reject expense.");
      return false;
    } finally {
      setBusy("");
    }
  }

  return {
    busy,
    message,
    setMessage,
    createExpense,
    updateExpense,
    attachReceipt,
    approveExpense,
    rejectExpense,
  };
}
