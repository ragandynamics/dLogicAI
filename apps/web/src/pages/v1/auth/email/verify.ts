import type { APIRoute } from "astro";

// Compatibility for verification emails issued before the web proxy prefix fix.
export const GET: APIRoute = ({ request }) => new Response(null, {
  status: 302,
  headers: {
    Location: `/api/v1/auth/email/verify${new URL(request.url).search}`,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  },
});
