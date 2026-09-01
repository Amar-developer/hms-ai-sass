import { NextRequest, NextResponse } from "next/server";

const INTERNAL_API_ORIGIN = (
  process.env.MEDIZINHUB_INTERNAL_API_URL ||
  "http://127.0.0.1:8080/api/v1"
)
  .replace(/\/$/, "")
  .replace(/\/api\/v1$/, "");

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

async function forward(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await context.params;
  const headers = new Headers(request.headers);
  HOP_BY_HOP_HEADERS.forEach((header) => headers.delete(header));

  const suffix = path.map(encodeURIComponent).join("/");
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body,
    duplex:
      request.method === "GET" || request.method === "HEAD" ? undefined : "half",
    cache: "no-store",
    redirect: "manual",
  };
  const response = await fetch(
    `${INTERNAL_API_ORIGIN}/${suffix}${request.nextUrl.search || ""}`,
    init,
  );

  const responseHeaders = new Headers(response.headers);
  HOP_BY_HOP_HEADERS.forEach((header) => responseHeaders.delete(header));

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
