import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types";
import { requireDashboard } from "../utils/auth";
import { jsonError, now } from "../utils/common";

const router = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
const filters = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  project_id: z.string().trim().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  action: z.string().trim().min(1).max(100).optional(),
});

router.get("/v1/operations/:view", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  c.header("Cache-Control", "no-store");
  const parsed = filters.safeParse(c.req.query());
  if (!parsed.success) return jsonError(c, "INVALID_REQUEST", "Choose a valid date range and filter.", 400);
  const { days, project_id: project, offset, action } = parsed.data;
  const until = now();
  const since = until - days * 86400000;
  const view = c.req.param("view");
  if (view === "audit") {
    if (!["owner", "admin", "billing"].includes(auth.role)) return jsonError(c, "FORBIDDEN", "Audit history is available to owners, admins and billing members.", 403);
    const rows = await c.env.DB.prepare(`SELECT a.id, a.action, a.resource_type, a.resource_id, a.created_at, a.metadata_json,
      COALESCE(u.name, 'System or former member') AS actor
      FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.tenant_id = ? AND a.created_at >= ? AND a.created_at <= ? ${action ? "AND a.action = ?" : ""}
      ORDER BY a.created_at DESC, a.id DESC LIMIT 51 OFFSET ?`)
      .bind(auth.tenantId, since, until, ...(action ? [action] : []), offset).all();
    return c.json({ records: rows.results.slice(0, 50).map(({ metadata_json, ...row }) => {
      let requestId: string | null = null;
      try { const metadata = JSON.parse(String(metadata_json)); if (typeof metadata.request_id === "string" && /^request_[a-zA-Z0-9-]{1,100}$/.test(metadata.request_id)) requestId = metadata.request_id; } catch { /* Older metadata may be malformed. */ }
      return { ...row, request_id: requestId };
    }), has_more: rows.results.length > 50, since, until });
  }
  if (view === "channels") {
    const rows = await c.env.DB.prepare(`SELECT w.id, w.project_id, w.chat_service_id, 'web' AS channel, w.name, w.status, w.updated_at, p.name AS project_name, s.name AS service_name
      FROM web_widgets w JOIN projects p ON p.id = w.project_id AND p.tenant_id = w.tenant_id
      JOIN chat_services s ON s.id = w.chat_service_id AND s.tenant_id = w.tenant_id AND s.project_id = w.project_id
      WHERE w.tenant_id = ?
      UNION ALL SELECT i.id, i.project_id, i.chat_service_id, i.channel, i.external_account_id AS name, i.status, i.updated_at, p.name AS project_name, s.name AS service_name
      FROM channel_installations i JOIN projects p ON p.id = i.project_id AND p.tenant_id = i.tenant_id
      JOIN chat_services s ON s.id = i.chat_service_id AND s.tenant_id = i.tenant_id AND s.project_id = i.project_id
      WHERE i.tenant_id = ? ORDER BY updated_at DESC`).bind(auth.tenantId, auth.tenantId).all();
    return c.json({ records: rows.results });
  }
  if (project && !await c.env.DB.prepare("SELECT id FROM projects WHERE id = ? AND tenant_id = ?").bind(project, auth.tenantId).first()) {
    return jsonError(c, "NOT_FOUND", "Project not found.", 404);
  }
  const values = [auth.tenantId, since, until, ...(project ? [project] : [])];
  if (view === "usage") {
    const rows = await c.env.DB.prepare(`SELECT u.project_id, p.name AS project_name, u.provider, u.model, u.billing_mode, u.status,
      COUNT(*) AS requests, COALESCE(SUM(CASE WHEN u.status = 'completed' THEN u.input_tokens ELSE 0 END),0) AS input_tokens,
      COALESCE(SUM(CASE WHEN u.status = 'completed' THEN u.output_tokens ELSE 0 END),0) AS output_tokens,
      COALESCE(SUM(CASE WHEN u.status = 'completed' THEN u.customer_charge_micros ELSE 0 END),0) AS customer_charge_micros
      FROM usage_events u LEFT JOIN projects p ON p.id = u.project_id AND p.tenant_id = u.tenant_id
      WHERE u.tenant_id = ? AND u.created_at >= ? AND u.created_at <= ? ${project ? "AND u.project_id = ?" : ""}
      GROUP BY u.project_id, p.name, u.provider, u.model, u.billing_mode, u.status ORDER BY requests DESC`).bind(...values).all();
    return c.json({ records: rows.results, since, until });
  }
  if (view === "analytics") {
    const base = `FROM conversations c LEFT JOIN projects p ON p.id = c.project_id AND p.tenant_id = c.tenant_id
      LEFT JOIN conversation_intelligence i ON i.id = (SELECT latest.id FROM conversation_intelligence latest WHERE latest.conversation_id = c.id ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1)
      WHERE c.tenant_id = ? AND c.updated_at >= ? AND c.updated_at <= ? ${project ? "AND c.project_id = ?" : ""}`;
    const summary = await c.env.DB.prepare(`SELECT COUNT(*) AS conversations, COUNT(i.id) AS analyzed,
      COALESCE(SUM(CASE WHEN i.sentiment = 'negative' THEN 1 ELSE 0 END),0) AS negative,
      COALESCE(SUM(CASE WHEN i.urgency_score > 60 THEN 1 ELSE 0 END),0) AS urgent,
      COALESCE(SUM(CASE WHEN i.escalation_risk_score > 60 THEN 1 ELSE 0 END),0) AS escalation ${base}`).bind(...values).first();
    const rows = await c.env.DB.prepare(`SELECT c.id, c.title, p.name AS project_name, i.sentiment, i.urgency_score, i.escalation_risk_score, c.updated_at ${base}
      AND (i.sentiment = 'negative' OR i.urgency_score > 60 OR i.escalation_risk_score > 60)
      ORDER BY c.updated_at DESC LIMIT 50`).bind(...values).all();
    return c.json({ summary, records: rows.results, since, until });
  }
  return jsonError(c, "NOT_FOUND", "View not found.", 404);
});
export const operationsRoutes = router;
