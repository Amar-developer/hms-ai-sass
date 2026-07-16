import { reportClientError } from "./clientLogging";

export const API_BASE = (
  process.env.NEXT_PUBLIC_MEDIZINHUB_API_URL || "http://127.0.0.1:8000/api/v1"
).replace(/\/$/, "");

export const UPLOADS_BASE = API_BASE.replace(/\/api\/v1$/, "");

export type ApiSession = {
  tenantId: string;
  email: string;
  user: any;
};

export const AUTH_SESSION_EXPIRED_EVENT = "medizinhub.auth.sessionExpired";

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

export async function apiFetch(
  path: string,
  session: ApiSession,
  options: RequestInit = {},
) {
  let res: Response;
  const idempotencyKey = idempotencyKeyFor(path, session, options);
  const correlationId = requestId();
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-ID": session.tenantId,
        "X-Request-ID": correlationId,
        ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
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
  if (res.status === 204 || res.headers.get("content-length") === "0")
    return null;
  return res.json();
}

export async function apiBlob(
  path: string,
  session: ApiSession,
  options: RequestInit = {},
) {
  let res: Response;
  const correlationId = requestId();
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "X-Tenant-ID": session.tenantId,
        "X-Request-ID": correlationId,
        ...(options.headers || {}),
      },
    });
  } catch {
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
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "X-Tenant-ID": session.tenantId,
        "X-Request-ID": correlationId,
      },
      body: formData,
    });
  } catch {
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
