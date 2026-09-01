import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

// Fallback for local dev, where no service binding to the API worker exists.
const API_ORIGIN =
  import.meta.env.API_BASE_URL ||
  import.meta.env.PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:8787";

type ApiService = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

type WebWorkerEnv = {
  API?: ApiService;
  API_BASE_URL?: string;
};

export const ALL: APIRoute = async ({ request, params }) => {
  const path = params.path || "";

  const upstreamPath =
    path === "health" || path.startsWith("health/") || path.startsWith("v1/")
      ? `/${path}`
      : `/v1/${path}`;

  const headers = new Headers(request.headers);
  headers.delete("host");

  const init: RequestInit = {
    method: request.method,
    headers,
    body:
      ["GET", "HEAD"].includes(request.method)
        ? undefined
        : request.body,
    redirect: "manual",
  };

  // Service binding avoids the public workers.dev-to-workers.dev fetch restriction
  // (Cloudflare error 1003) and skips DNS/TLS for the worker-to-worker hop.
  const workerEnv = env as unknown as WebWorkerEnv;
  const apiService = workerEnv.API;
  const apiOrigin = workerEnv.API_BASE_URL || API_ORIGIN;

  const response = apiService
    ? await apiService.fetch(`https://api.internal${upstreamPath}`, init)
    : await fetch(`${apiOrigin}${upstreamPath}`, init);

  const out = new Response(response.body, response);

  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    out.headers.set("set-cookie", setCookie);
  }

  return out;
};
