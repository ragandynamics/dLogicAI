import type { APIRoute } from "astro";

const API_BASE_URL =
  import.meta.env.PUBLIC_API_BASE_URL || "http://127.0.0.1:8787";

  //Debug code
  console.log("PUBLIC_API_BASE_URL:", import.meta.env.PUBLIC_API_BASE_URL);
console.log("API_BASE_URL:", API_BASE_URL);

export const ALL: APIRoute = async ({ request, params }) => {
  const path = params.path || "";

  const upstreamPath =
    path === "health" || path.startsWith("health/")
      ? `/${path}`
      : `/v1/${path}`;

  const headers = new Headers(request.headers);
  headers.delete("host");

  const response = await fetch(
    `${API_BASE_URL}${upstreamPath}`,
    {
      method: request.method,
      headers,
      body:
        ["GET", "HEAD"].includes(request.method)
          ? undefined
          : request.body,
      redirect: "manual",
    },
  );

  const out = new Response(response.body, response);

  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    out.headers.set("set-cookie", setCookie);
  }

  return out;
};
