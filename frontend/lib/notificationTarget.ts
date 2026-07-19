export type NotificationTarget = {
  resourceType: string;
  resourceId: string;
  commentId?: string | null;
  eventType?: string | null;
};

const TARGET_KEY = "medizinhub.notificationTarget";

const MENTION_MODULE_BY_RESOURCE: Record<string, string> = {
  appointment: "appointments",
  consultation: "consultation",
  patient: "patients",
  invoice: "billing",
  ip_admission: "ip",
  physiotherapy_case: "physiotherapy",
  home_care_booking: "home_care",
};

export function notificationDestination(row: {
  event_type?: string | null;
  action_module?: string | null;
  resource_type?: string | null;
}) {
  if (row.event_type === "comment.mentioned" && row.resource_type) {
    return MENTION_MODULE_BY_RESOURCE[row.resource_type] || row.action_module;
  }
  return row.action_module;
}

export function saveNotificationTarget(row: {
  resource_type?: string | null;
  resource_id?: string | null;
  event_type?: string | null;
  metadata_json?: string | null;
}) {
  if (typeof window === "undefined" || !row.resource_type || !row.resource_id) {
    return;
  }
  let commentId: string | null = null;
  try {
    const metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {};
    commentId = metadata?.comment_id || null;
  } catch {
    commentId = null;
  }
  const target: NotificationTarget = {
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    commentId,
    eventType: row.event_type || null,
  };
  window.sessionStorage.setItem(TARGET_KEY, JSON.stringify(target));
}

export function readNotificationTarget(
  resourceType?: string,
): NotificationTarget | null {
  if (typeof window === "undefined") return null;
  try {
    const target = JSON.parse(
      window.sessionStorage.getItem(TARGET_KEY) || "null",
    ) as NotificationTarget | null;
    if (!target?.resourceType || !target.resourceId) return null;
    if (resourceType && target.resourceType !== resourceType) return null;
    return target;
  } catch {
    return null;
  }
}

export function clearNotificationTarget(target: NotificationTarget) {
  const current = readNotificationTarget();
  if (
    current?.resourceType === target.resourceType &&
    current.resourceId === target.resourceId &&
    current.commentId === target.commentId
  ) {
    window.sessionStorage.removeItem(TARGET_KEY);
  }
}
