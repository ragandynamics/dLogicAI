import { widgetBehaviorSchema } from "./widget-behavior";
import { z } from "zod";
import type { AppContext } from "../types";
import { requireDashboard } from "../utils/auth";
import { canManageTenantServices } from "../tenant-roles";
import { jsonError } from "../utils/common";

export const widgetConfig = widgetBehaviorSchema.extend({
  origin: z.string().url().max(255).refine((value) => {
    try {
      const u = new URL(value);
      const loopback = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
      return !u.username && !u.password && (u.protocol === "https:" || (u.protocol === "http:" && loopback));
    } catch { return false; }
  }, "Use an HTTPS website URL. HTTP is allowed only for localhost development.").transform((value) => new URL(value).origin),
  title: z.string().trim().min(1).max(80).default("Chat with us"),
  welcome: z.string().trim().min(1).max(300).default("Welcome. How can we help?"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2563eb"),
  position: z.enum(["left", "right"]).default("right"),
});

export async function setupScope(c: AppContext) {
  const auth = await requireDashboard(c);
  if (!auth) return { error: jsonError(c, "UNAUTHORIZED", "Sign in to continue.", 401) };
  if (!canManageTenantServices(auth.role)) return { error: jsonError(c, "FORBIDDEN", "Service management access is required.", 403) };
  const service = await c.env.DB.prepare("SELECT id FROM chat_services WHERE id = ? AND project_id = ? AND tenant_id = ?")
    .bind(c.req.param("serviceId"), c.req.param("projectId"), auth.tenantId).first();
  if (!service) return { error: jsonError(c, "NOT_FOUND", "Chat Service not found.", 404) };
  return { auth };
}

// Atomic fixed-window limiter, shared across Worker instances. Keys are bounded
// by widget/session IDs; expired rows are removed when sessions are created.
export async function takeRate(c: AppContext, key: string, limit: number, period = 60000) {
  const window = Math.floor(Date.now() / period) * period;
  const result = await c.env.DB.prepare(`INSERT INTO channel_rate_limits (key, window, count) VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET window = excluded.window,
    count = CASE WHEN channel_rate_limits.window = excluded.window THEN channel_rate_limits.count + 1 ELSE 1 END
    WHERE channel_rate_limits.window != excluded.window OR channel_rate_limits.count < ?`)
    .bind(key, window, limit).run();
  return Number(result.meta.changes) === 1;
}
