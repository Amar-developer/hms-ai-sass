"use client";

import { useState } from "react";

import { createSchedule, updateSchedule, deleteSchedule } from "../api";

export function useSchedulingActions(apiSession: any) {
  const [busy, setBusy] = useState(false);

  async function create(practitionerId: string, payload: any, session: any) {
    setBusy(true);

    try {
      return await createSchedule(practitionerId, payload, session);
    } finally {
      setBusy(false);
    }
  }

  async function update(id: string, payload: any, session: any) {
    setBusy(true);

    try {
      return await updateSchedule(id, payload, session);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, session: any) {
    setBusy(true);

    try {
      return await deleteSchedule(id, session);
    } finally {
      setBusy(false);
    }
  }

  return {
    create,
    update,
    remove,
    busy,
  };
}
