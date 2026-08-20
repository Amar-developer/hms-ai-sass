import { apiFetch } from "@/lib/api";
import type { QueryFilterRow } from "@/utils/queryFilter";
import type { SortState } from "@/utils/types";

export function getTenants(apiSession: any) {
  return apiFetch("/tenants", apiSession);
}

export function getDoctors(session: any) {
  return apiFetch("/practitioners", session);
}

export function getSchedules(session: any) {
  return apiFetch("/practitioners/schedules", session);
}

export function getSchedulePage(
  session: any,
  params: {
    q?: string;
    weekday?: string;
    queryFilters?: QueryFilterRow[];
    sort?: SortState | null;
    limit: number;
    offset: number;
  },
) {
  const search = new URLSearchParams();
  if (params.q?.trim()) search.set("q", params.q.trim());
  if (params.weekday && params.weekday !== "all")
    search.set("weekday", params.weekday);
  if (params.queryFilters?.length)
    search.set("filters", JSON.stringify(params.queryFilters));
  if (params.sort) search.set("sort", JSON.stringify(params.sort));
  search.set("limit", String(params.limit));
  search.set("offset", String(params.offset));
  return apiFetch(`/practitioners/schedules/page?${search.toString()}`, session);
}

export function getScheduleFilterOptions(session: any) {
  return apiFetch<Record<string, { value: string; label: string }[]>>(
    "/practitioners/schedules/filter-options",
    session,
  );
}

export function createSchedule(
  practitionerId: string,
  payload: any,
  session: any,
) {
  return apiFetch(`/practitioners/${practitionerId}/schedules`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateSchedule(id: string, payload: any, session: any) {
  return apiFetch(`/practitioners/schedules/${id}`, session, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteSchedule(id: string, session: any) {
  return apiFetch(`/practitioners/schedules/${id}`, session, {
    method: "DELETE",
  });
}
