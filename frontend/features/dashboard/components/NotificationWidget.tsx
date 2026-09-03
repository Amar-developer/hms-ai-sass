"use client";

import { useEffect, useState } from "react";
import { BellRing, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  notificationDestination,
  saveNotificationTarget,
} from "@/lib/notificationTarget";
import { Card } from "@/app/components/common/ui";

export function NotificationWidget({ apiSession, setActive }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!apiSession) return;
    let active = true;
    apiFetch("/notifications/in-app?limit=5&unread_only=true", apiSession)
      .then((data: any) => {
        if (!active) return;
        setRows(data.items || []);
        setUnreadCount(Number(data.unread_count || 0));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [apiSession?.tenantId, apiSession?.user?.id]);

  if (!rows.length) return null;

  async function open(row: any) {
    apiFetch(`/notifications/in-app/${row.id}`, apiSession, {
      method: "PATCH",
      body: JSON.stringify({ is_read: true }),
    }).catch(() => {});
    if (typeof window !== "undefined" && row.resource_id) {
      saveNotificationTarget(row);
      if (row.resource_type === "invoice") {
        window.sessionStorage.setItem(
          "medizinhub.billingInvoiceId",
          row.resource_id,
        );
      }
      if (row.resource_type === "appointment") {
        window.sessionStorage.setItem(
          "medizinhub.notificationAppointmentId",
          row.resource_id,
        );
      }
    }
    const destination = notificationDestination(row);
    if (row.resource_type === "appointment" && row.resource_id) {
      setActive?.({ id: "opd", appointmentId: row.resource_id });
    } else if (destination) {
      setActive?.(destination);
    }
  }

  return (
    <Card className="p-3 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
            <BellRing size={18} />
          </div>
          <div>
            <h3 className="card-title font-bold">Action Required</h3>
            <p className="card-desc text-slate-500">
              {unreadCount} unread appointment, request, or system update
              {unreadCount === 1 ? "" : "s"}.
            </p>
          </div>
        </div>
      </div>
      <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => open(row)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                row.priority === "urgent"
                  ? "bg-red-500"
                  : row.priority === "high"
                    ? "bg-amber-500"
                    : "bg-blue-500"
              }`}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-slate-900">
                {row.title}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {row.message}
              </span>
            </span>
            {row.action_module && (
              <ChevronRight size={16} className="shrink-0 text-slate-300" />
            )}
          </button>
        ))}
      </div>
    </Card>
  );
}
