import { reportClientError } from "./clientLogging";
import { limitApiRequest } from "./concurrency";

export const API_BASE = (
  process.env.NEXT_PUBLIC_MEDIZINHUB_API_URL || "http://127.0.0.1:8000/api/v1"
).replace(/\/$/, "");

export const UPLOADS_BASE = API_BASE.replace(/\/api\/v1$/, "");

export function uploadAssetUrl(value: string | null | undefined): string {
  const path = String(value || "").trim();
  if (!path) return "";
  if (path.startsWith("/uploads/")) return `${UPLOADS_BASE}${path}`;
  if (path.startsWith("uploads/")) return `${UPLOADS_BASE}/${path}`;
  return path;
}

export type ApiSession = {
  tenantId: string;
  email: string;
  basePermissions?: string[];
  user: {
    id?: string;
    tenant_id?: string | null;
    tenant_name?: string | null;
    branch_id?: string | null;
    email?: string;
    is_super_admin?: boolean;
    user_type?: string;
    roles?: string[];
    permissions?: string[];
  };
};

export const AUTH_SESSION_EXPIRED_EVENT = "medizinhub.auth.sessionExpired";
export const LIVE_DATA_CHANGED_EVENT = "medizinhub.liveData.changed";
export const LIVE_DATA_CHANGED_STORAGE_KEY =
  "medizinhub.liveData.changed.revision";

export const DEFAULT_API_TIMEOUT_MS = 20_000;
export const UPLOAD_API_TIMEOUT_MS = 60_000;

export class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`The server did not respond within ${Math.round(timeoutMs / 1000)} seconds.`);
    this.name = "RequestTimeoutError";
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_API_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const upstreamSignal = init.signal;
  let timedOut = false;
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal?.aborted) abortFromUpstream();
  else upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new RequestTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  }
}

const IDEMPOTENT_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const IDEMPOTENCY_KEY_TTL_MS = 2 * 60 * 1000;
const idempotencyKeys = new Map<string, { key: string; expiresAt: number }>();

function requestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export type ApiErrorLike = Error & {
  status?: number;
  path?: string;
  detail?: string;
  requestId?: string | null;
  permissionDenied?: boolean;
};

type ApiFetchOptions = RequestInit & {
  suppressErrorReportStatuses?: number[];
};

const GENERIC_FORBIDDEN =
  /^(permission denied|forbidden|not allowed|access denied)\.?$/i;

function friendlyMessage(status: number, detail: string): string {
  // Permission problems get a clean, human sentence — never the raw route
  // path or the correlation id, which read as scary "error" noise to staff.
  if (status === 403) {
    return GENERIC_FORBIDDEN.test(detail.trim())
      ? "You do not have permission to perform this action. Ask a tenant admin to enable it for your role."
      : detail;
  }
  if (status === 404) return detail;
  return detail;
}

function apiError(
  path: string,
  detail: string,
  response: Response,
): ApiErrorLike {
  const correlationId = response.headers.get("x-request-id");
  const status = response.status;
  // Keep the route path + request id on non-permission errors (developers rely
  // on them for debugging); strip them from access errors shown to end users.
  const message =
    status === 403 || status === 401
      ? friendlyMessage(status, detail)
      : `${path}: ${detail}${correlationId ? ` [request ${correlationId}]` : ""}`;
  const error = new Error(message) as ApiErrorLike;
  error.status = status;
  error.path = path;
  error.detail = detail;
  error.requestId = correlationId;
  error.permissionDenied = status === 403;
  return error;
}

function notifySessionExpired() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT));
}

function notifyLiveDataChanged(
  path: string,
  session: ApiSession,
  method: string,
) {
  if (typeof window === "undefined") return;
  const detail = {
    tenantId: session.tenantId,
    path,
    method,
    revision: `${Date.now()}-${requestId()}`,
  };
  window.dispatchEvent(new CustomEvent(LIVE_DATA_CHANGED_EVENT, { detail }));
  try {
    // The custom event updates the current tab. Storage events notify other
    // open HMS tabs without persisting any clinical or patient data.
    localStorage.setItem(
      LIVE_DATA_CHANGED_STORAGE_KEY,
      JSON.stringify({ tenantId: detail.tenantId, revision: detail.revision }),
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    // Same-tab refresh still works when storage is blocked or unavailable.
  }
}

function reportApiFailure(
  path: string,
  status: number,
  detail: string,
  requestId: string | null,
  method: string,
  session: ApiSession,
) {
  reportClientError(
    new Error(detail),
    {
      event:
        status >= 500
          ? "frontend.api_server_error"
          : status === 401 || status === 403
            ? "frontend.api_permission_error"
            : "frontend.api_request_error",
      module: "api",
      category:
        status === 401 || status === 403
          ? "permission"
          : status === 422
            ? "validation"
            : "api",
      level: status >= 500 ? "error" : "warning",
      requestId,
      method,
      statusCode: status,
      metadata: { api_path: path },
    },
    session,
  );
}

function cleanupIdempotencyKeys(now = Date.now()) {
  for (const [signature, cached] of idempotencyKeys.entries()) {
    if (cached.expiresAt <= now) idempotencyKeys.delete(signature);
  }
}

function hashText(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function requestBodySignature(body: BodyInit | null | undefined) {
  if (typeof body === "string") return body;
  if (!body) return "";
  return String(body);
}

function retryDelayMs(response: Response) {
  const retryAfter = Number(response.headers.get("retry-after") || 0);
  const base =
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000;
  return base + Math.floor(Math.random() * 500);
}

function waitForRetry(delayMs: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Request cancelled", "AbortError"));
      return;
    }
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Request cancelled", "AbortError"));
    };
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function idempotencyKeyFor(
  path: string,
  session: ApiSession,
  options: RequestInit,
) {
  const method = String(options.method || "GET").toUpperCase();
  if (!IDEMPOTENT_METHODS.has(method)) return null;
  const headers = new Headers(options.headers || {});
  if (headers.has("X-Idempotency-Key")) return null;

  cleanupIdempotencyKeys();
  const signature = [
    session.tenantId,
    session.user?.id || session.email || "",
    method,
    path,
    requestBodySignature(options.body),
  ].join("\n");
  const existing = idempotencyKeys.get(signature);
  if (existing) {
    existing.expiresAt = Date.now() + IDEMPOTENCY_KEY_TTL_MS;
    return existing.key;
  }
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const key = `mh-${hashText(signature)}-${randomPart}`;
  idempotencyKeys.set(signature, {
    key,
    expiresAt: Date.now() + IDEMPOTENCY_KEY_TTL_MS,
  });
  return key;
}

async function readErrorDetail(res: Response) {
  let detail = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    detail =
      typeof body.detail === "string"
        ? body.detail
        : body.detail
          ? JSON.stringify(body.detail)
          : detail;
  } catch {}
  return detail;
}

export async function apiFetch<T = any>(
  path: string,
  session: ApiSession,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { suppressErrorReportStatuses = [], ...fetchOptions } = options;
  let res: Response;
  const method = String(fetchOptions.method || "GET").toUpperCase();
  const idempotencyKey = idempotencyKeyFor(path, session, fetchOptions);
  const correlationId = requestId();
  try {
    const attempts = method === "GET" || method === "HEAD" ? 2 : 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      res = await limitApiRequest(
        () =>
          fetchWithTimeout(`${API_BASE}${path}`, {
            ...fetchOptions,
            cache: fetchOptions.cache ?? "no-store",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "X-Tenant-ID": session.tenantId,
              "X-Request-ID": correlationId,
              ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
              ...(fetchOptions.headers || {}),
            },
          }),
        fetchOptions.signal,
      );
      if (res.status !== 503 || attempt === attempts) break;
      await waitForRetry(retryDelayMs(res), fetchOptions.signal);
    }
  } catch (error) {
    if (
      error instanceof RequestTimeoutError ||
      (error instanceof DOMException && error.name === "AbortError")
    )
      throw error;
    reportClientError(
      new Error(`Backend connection failed for ${path}`),
      {
        event: "frontend.api_connection_failed",
        module: "api",
        requestId: correlationId,
      },
      session,
    );
    throw new Error(
      `Could not connect to MedizinHub HMS backend at ${API_BASE}. Start the FastAPI server, confirm /health or /api/v1/health opens, and check NEXT_PUBLIC_MEDIZINHUB_API_URL/CORS settings.`,
    );
  }
  if (!res.ok) {
    const detail = await readErrorDetail(res);
    if (res.status === 401) notifySessionExpired();
    if (
      res.status !== 503 &&
      !suppressErrorReportStatuses.includes(res.status)
    ) {
      reportApiFailure(
        path,
        res.status,
        detail,
        res.headers.get("x-request-id"),
        method,
        session,
      );
    }
    throw apiError(path, detail, res);
  }
  if (IDEMPOTENT_METHODS.has(method)) {
    notifyLiveDataChanged(path, session, method);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0")
    return null as T;
  return res.json() as Promise<T>;
}

export async function apiBlob(
  path: string,
  session: ApiSession,
  options: RequestInit = {},
) {
  let res: Response;
  const correlationId = requestId();
  try {
    res = await limitApiRequest(
      () =>
        fetchWithTimeout(`${API_BASE}${path}`, {
          ...options,
          cache: options.cache ?? "no-store",
          credentials: "include",
          headers: {
            "X-Tenant-ID": session.tenantId,
            "X-Request-ID": correlationId,
            ...(options.headers || {}),
          },
        }),
      options.signal,
    );
  } catch (error) {
    if (
      error instanceof RequestTimeoutError ||
      (error instanceof DOMException && error.name === "AbortError")
    )
      throw error;
    reportClientError(
      new Error(`Backend blob request failed for ${path}`),
      {
        event: "frontend.api_connection_failed",
        module: "api",
      },
      session,
    );
    throw new Error(
      `Could not connect to MedizinHub HMS backend at ${API_BASE}. Start the FastAPI server, confirm /health or /api/v1/health opens, and check NEXT_PUBLIC_MEDIZINHUB_API_URL/CORS settings.`,
    );
  }
  if (!res.ok) {
    const detail = await readErrorDetail(res);
    if (res.status === 401) notifySessionExpired();
    reportApiFailure(
      path,
      res.status,
      detail,
      res.headers.get("x-request-id"),
      String(options.method || "GET").toUpperCase(),
      session,
    );
    throw apiError(path, detail, res);
  }
  const method = String(options.method || "GET").toUpperCase();
  if (IDEMPOTENT_METHODS.has(method)) {
    notifyLiveDataChanged(path, session, method);
  }
  return res.blob();
}

export async function apiUpload(
  path: string,
  session: ApiSession,
  formData: FormData,
) {
  let res: Response;
  const correlationId = requestId();
  try {
    res = await limitApiRequest(() =>
      fetchWithTimeout(
        `${API_BASE}${path}`,
        {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          headers: {
            "X-Tenant-ID": session.tenantId,
            "X-Request-ID": correlationId,
          },
          body: formData,
        },
        UPLOAD_API_TIMEOUT_MS,
      ),
    );
  } catch (error) {
    if (error instanceof RequestTimeoutError) throw error;
    reportClientError(
      new Error(`Backend upload failed for ${path}`),
      {
        event: "frontend.api_connection_failed",
        module: "api",
      },
      session,
    );
    throw new Error(
      `Could not connect to MedizinHub HMS backend at ${API_BASE}.`,
    );
  }
  if (!res.ok) {
    const detail = await readErrorDetail(res);
    if (res.status === 401) notifySessionExpired();
    reportApiFailure(
      path,
      res.status,
      detail,
      res.headers.get("x-request-id"),
      "POST",
      session,
    );
    throw apiError(path, detail, res);
  }
  notifyLiveDataChanged(path, session, "POST");
  return res.json();
}

export type PhysiotherapyInvoicePayload = {
  tax_rule_id?: string | null;
  created_by_user_id?: string | null;
};

export type InvoicePaymentPayload = {
  method: string;
  amount: number;
  reference_number?: string | null;
  collected_by_user_id?: string | null;
};

export function getPhysiotherapyInvoice(session: ApiSession, caseId: string) {
  return apiFetch(`/physiotherapy/cases/${caseId}/invoice`, session);
}

export function generatePhysiotherapyInvoice(
  session: ApiSession,
  caseId: string,
  payload: PhysiotherapyInvoicePayload = {},
) {
  return apiFetch(`/physiotherapy/cases/${caseId}/invoice`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function recordInvoicePayment(
  session: ApiSession,
  invoiceId: string,
  payload: InvoicePaymentPayload,
) {
  return apiFetch(`/billing/invoices/${invoiceId}/payments`, session, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
