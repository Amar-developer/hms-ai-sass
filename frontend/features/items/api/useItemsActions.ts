"use client";

import type { ApiSession } from "@/lib/api";
import { ItemFormValues } from "@/features/items/items.schema";
import { findDuplicateItem, generatedItemCode } from "../helpers";
import * as itemsApi from "./items.api";

type UseItemsActionsParams = {
  apiSession: ApiSession | null | undefined;
  type: string;
  editing: any;
  rows: any[];
  packageTestIds: string[];
  setEditing: (row: any) => void;
  setBusy: (value: string) => void;
  setMessage: (value: string) => void;
  setConfirmAction: (action: any) => void;
  confirmAction: any;
  resetItemForm: (nextType?: string) => void;
  load: () => Promise<void>;
};

/**
 * Write actions for the item master: creating/updating an item (dispatched
 * by type to the right catalog endpoint) and deleting one after the confirm
 * modal is accepted.
 */
export function useItemsActions({
  apiSession,
  type,
  editing,
  rows,
  packageTestIds,
  setEditing,
  setBusy,
  setMessage,
  setConfirmAction,
  confirmAction,
  resetItemForm,
  load,
}: UseItemsActionsParams) {
  async function handleItemSubmit(data: ItemFormValues) {
    if (!apiSession) return;

    const duplicate = findDuplicateItem(rows, data.name, editing?.id);
    if (duplicate) {
      setMessage(`An item named "${data.name.trim()}" already exists.`);
      return false;
    }

    setBusy("save");
    setMessage("");

    try {
      const isEditing = !!editing;
      const itemCode = isEditing
        ? type === "physio_equipment"
          ? editing.serial_number ||
            editing.code ||
            generatedItemCode(type, data.name)
          : editing.code || generatedItemCode(type, data.name)
        : generatedItemCode(type, data.name);

      let body: any = { code: itemCode, name: data.name };

      if (type === "medicine") {
        body = {
          ...body,
          generic_name: data.generic_name || null,
          supplier_id: data.supplier_id || null,
          mrp_price: Number(data.mrp_price || 0),
          purchase_price: Number(data.purchase_price || 0),
          default_sale_price: Number(data.price || 0),
          reorder_level: Number(data.reorder_level || 0),
        };
      } else if (type === "lab_test") {
        body = {
          ...body,
          supplier_id: data.supplier_id || null,
          mrp_price: Number(data.mrp_price || 0),
          purchase_price: Number(data.purchase_price || 0),
          default_price: Number(data.price || 0),
          sample_type: data.sample_type || null,
        };
      } else if (type === "lab_package") {
        body = {
          ...body,
          description: data.description || null,
          mrp_price: Number(data.mrp_price || 0),
          purchase_price: 0,
          package_price: Number(data.price || 0),
          test_ids: packageTestIds,
          ...(isEditing
            ? { updated_by_user_id: apiSession.user?.id }
            : { created_by_user_id: apiSession.user?.id }),
        };
      } else if (
        type === "home_care_service" ||
        type === "home_visit_service"
      ) {
        body = {
          ...body,
          description: data.description || null,
          mrp_price: Number(data.mrp_price || 0),
          default_price: Number(data.price || 0),
        };
      } else if (type === "physio_equipment") {
        body = {
          ...body,
          modality_type: data.modality_type,
          supplier_id: data.supplier_id || null,
          mrp_price: Number(data.mrp_price),
          purchase_price: Number(data.purchase_price || 0),
          manufacturer: data.manufacturer || null,
          model_number: data.model_number || null,
          serial_number: itemCode,
          is_portable: data.is_portable === "true",
        };
      }

      await itemsApi.saveItem(apiSession, type, editing?.id, body);

      await load();

      setEditing(null);
      resetItemForm(type);

      setMessage(
        isEditing ? "Item updated successfully." : "Item created successfully.",
      );
      return true;
    } catch (err: any) {
      console.error(err);
      setMessage(err.detail || err.message || "Failed to save item.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function confirmDelete() {
    if (!apiSession || !confirmAction) return;

    const row = confirmAction.row;

    setBusy(`delete-${row.id}`);
    setMessage("");

    try {
      await itemsApi.deleteItem(apiSession, row.type, row.id);

      await load();

      setMessage("Item deleted.");
      setConfirmAction(null);
    } catch (err: any) {
      setMessage(err.message || "Could not delete item.");
    } finally {
      setBusy("");
    }
  }

  return { handleItemSubmit, confirmDelete };
}
