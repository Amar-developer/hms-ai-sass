import { request, type APIRequestContext, type APIResponse } from "@playwright/test";
import fs from "node:fs";

import { seedFile, type ActorName } from "./paths";
import type { FrontendSeed } from "./types";

export const apiBaseUrl =
  process.env.MEDIZINHUB_FRONTEND_E2E_API_URL ||
  "http://127.0.0.1:8091/api/v1";

const requestMethods = new Set([
  "delete",
  "fetch",
  "get",
  "head",
  "patch",
  "post",
  "put",
]);

export async function createApiContext() {
  const raw = await request.newContext({
    baseURL: `${apiBaseUrl.replace(/\/$/, "")}/`,
  });
  return new Proxy(raw, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof property === "string" && requestMethods.has(property)) {
        return (url: string, options?: unknown) =>
          value.call(
            target,
            url.startsWith("/") ? `.${url}` : url,
            options,
          );
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as APIRequestContext;
}

export function uniqueValue(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 10)}`;
}

export function readSeed(): FrontendSeed {
  return JSON.parse(fs.readFileSync(seedFile, "utf8")) as FrontendSeed;
}

async function responseDetail(response: APIResponse) {
  const text = await response.text();
  return `${response.url()} returned ${response.status()}: ${text}`;
}

export async function expectApi<T>(
  response: APIResponse,
  expected: number | number[],
): Promise<T> {
  const statuses = Array.isArray(expected) ? expected : [expected];
  if (!statuses.includes(response.status())) {
    throw new Error(await responseDetail(response));
  }
  if (response.status() === 204) return null as T;
  return (await response.json()) as T;
}

export async function loginApi(email: string, password: string) {
  const context = await createApiContext();
  const login = await context.post("/auth/login", {
    data: { email, password },
  });
  const body = await expectApi<any>(login, 200);
  return { context, user: body.user };
}

export async function actorApi(actor: ActorName) {
  const seed = readSeed();
  const credentials = seed.actors[actor];
  const loggedIn = await loginApi(credentials.email, credentials.password);
  return {
    ...loggedIn,
    seed,
    headers: { "X-Tenant-ID": seed.tenantId },
  };
}

export async function apiGet<T>(
  context: APIRequestContext,
  path: string,
  tenantId?: string,
) {
  return expectApi<T>(
    await context.get(path, {
      headers: tenantId ? { "X-Tenant-ID": tenantId } : undefined,
    }),
    200,
  );
}
