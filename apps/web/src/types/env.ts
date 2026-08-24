// Browser requests use Astro's same-origin API proxy. This keeps the HttpOnly
// session cookie first-party when the web UI and Worker run on different hosts.
export const API_BASE_URL = "/api";
