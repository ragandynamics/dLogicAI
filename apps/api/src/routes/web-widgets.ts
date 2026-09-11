import { widgetBehaviorSchema } from "../services/widget-behavior";
import { featureAllowed } from '../services/platform-features';
import { auditMutation } from "../services/audit";
import { Hono } from "hono";
import { z } from "zod";
import { bodyLimit } from "hono/body-limit";
import type { Env, HonoVariables } from "../types";
import { id, now, jsonError } from "../utils/common";
import { sha256 } from "../utils/crypto";
import { setupScope, takeRate, widgetConfig } from "../services/channel-setup";
import { executeResponse } from "./responses";
import { verifyBusinessIdentity } from '../services/business-identity';

type Widget = { id: string; tenant_id: string; project_id: string; chat_service_id: string; name: string | null; config_json: string; status: string };
const router = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
router.use("/v1/widgets/*", bodyLimit({ maxSize: 16384, onError: (c) => jsonError(c, "INPUT_TOO_LARGE", "Request is too large.", 413) }));
const scope = "/v1/projects/:projectId/chat-services/:serviceId/web-widget";
const widgetInput = widgetConfig.extend({ name: z.string().trim().min(1).max(80).default("Website widget") });
const splitWidgetInput = (data: z.infer<typeof widgetInput>) => {
  const { name, ...config } = data;
  return { name, config };
};
const configError = (c: any, parsed: { error: { issues: { message: string }[] } }) =>
  jsonError(c, "INVALID_CONFIG", parsed.error.issues[0]?.message || "Enter a valid website URL, title, welcome message and color.", 400);

router.get(scope, async (c) => {
  const access = await setupScope(c); if (access.error) return access.error;
  const rows = await c.env.DB.prepare("SELECT * FROM web_widgets WHERE chat_service_id = ? AND tenant_id = ? AND project_id = ? ORDER BY created_at DESC")
    .bind(c.req.param("serviceId"), access.auth.tenantId, c.req.param("projectId")).all<Widget>();
  const widgets = rows.results.map((widget) => ({ id: widget.id, name: widget.name || "Website widget", status: widget.status, config: JSON.parse(widget.config_json) }));
  return c.json({ widgets, widget: widgets[0] || null });
});
router.post(scope, async (c) => {
  const access = await setupScope(c); if (access.error) return access.error;
  const parsed = widgetInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return configError(c, parsed);
  const widgetId = id("widget");
  const input = splitWidgetInput(parsed.data);
  await auditMutation(c, access.auth, "widget.created", "web_widget", widgetId, c.env.DB.prepare("INSERT INTO web_widgets (id, tenant_id, project_id, chat_service_id, name, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(widgetId, access.auth.tenantId, c.req.param("projectId"), c.req.param("serviceId"), input.name, JSON.stringify(input.config), now(), now()));
  return c.json({ widget: { id: widgetId, name: input.name, status: "draft", config: input.config } }, 201);
});
// Compatibility for the original single-widget setup screen. New clients use
// the widget ID routes below.
router.put(scope, async (c) => {
  const access = await setupScope(c); if (access.error) return access.error;
  const parsed = widgetConfig.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return configError(c, parsed);
  const existing = await c.env.DB.prepare("SELECT id FROM web_widgets WHERE chat_service_id = ? AND tenant_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(c.req.param("serviceId"), access.auth.tenantId, c.req.param("projectId")).first<{ id: string }>();
  if (!existing) {
    const widgetId = id("widget");
    await auditMutation(c, access.auth, "widget.created", "web_widget", widgetId, c.env.DB.prepare("INSERT INTO web_widgets (id, tenant_id, project_id, chat_service_id, name, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(widgetId, access.auth.tenantId, c.req.param("projectId"), c.req.param("serviceId"), parsed.data.title, JSON.stringify(parsed.data), now(), now()));
    return c.json({ saved: true, widget: { id: widgetId, name: parsed.data.title, status: "draft", config: parsed.data } });
  }
  await auditMutation(c, access.auth, "widget.updated", "web_widget", existing.id, c.env.DB.prepare("UPDATE web_widgets SET config_json = ?, status = CASE WHEN json_extract(config_json, '$.origin') != ? THEN 'draft' ELSE status END, updated_at = ? WHERE id = ? AND tenant_id = ?")
    .bind(JSON.stringify(parsed.data), parsed.data.origin, now(), existing.id, access.auth.tenantId));
  return c.json({ saved: true });
});
router.put(`${scope}/:widgetId`, async (c) => {
  const access = await setupScope(c); if (access.error) return access.error;
  const parsed = widgetInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return configError(c, parsed);
  const input = splitWidgetInput(parsed.data);
  const result = await auditMutation(c, access.auth, "widget.updated", "web_widget", c.req.param("widgetId") || c.req.param("serviceId"), c.env.DB.prepare("UPDATE web_widgets SET name = ?, config_json = ?, status = CASE WHEN json_extract(config_json, '$.origin') != ? THEN 'draft' ELSE status END, updated_at = ? WHERE id = ? AND chat_service_id = ? AND tenant_id = ? AND project_id = ?")
    .bind(input.name, JSON.stringify(input.config), input.config.origin, now(), c.req.param("widgetId"), c.req.param("serviceId"), access.auth.tenantId, c.req.param("projectId")));
  if (!result.meta.changes) return jsonError(c, "NOT_FOUND", "Web Chat widget not found.", 404);
  return c.json({ saved: true });
});
router.post(`${scope}/:widgetId/status`, async (c) => {
  const access = await setupScope(c); if (access.error) return access.error;
  const parsed = z.object({ status: z.enum(["active", "inactive"]) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return jsonError(c, "INVALID_REQUEST", "Choose active or inactive.");
  if(parsed.data.status==='active' && !await featureAllowed(c.env.DB,'channel.web',access.auth.tenantId))return jsonError(c,'FEATURE_UNAVAILABLE','Web Chat activation is unavailable.',403);
  const result = await auditMutation(c, access.auth, "widget.status." + parsed.data.status, "web_widget", c.req.param("widgetId") || c.req.param("serviceId"), c.env.DB.prepare("UPDATE web_widgets SET status = ?, updated_at = ? WHERE id = ? AND chat_service_id = ? AND tenant_id = ? AND project_id = ?")
    .bind(parsed.data.status, now(), c.req.param("widgetId"), c.req.param("serviceId"), access.auth.tenantId, c.req.param("projectId")));
  if (!result.meta.changes) return jsonError(c, "NOT_FOUND", "Save the widget first.", 404);
  return c.json({ status: parsed.data.status });
});
router.post(`${scope}/status`, async (c) => {
  const access = await setupScope(c); if (access.error) return access.error;
  const parsed = z.object({ status: z.enum(["active", "inactive"]) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return jsonError(c, "INVALID_REQUEST", "Choose active or inactive.");
  if(parsed.data.status==='active' && !await featureAllowed(c.env.DB,'channel.web',access.auth.tenantId))return jsonError(c,'FEATURE_UNAVAILABLE','Web Chat activation is unavailable.',403);
  const widget = await c.env.DB.prepare("SELECT id FROM web_widgets WHERE chat_service_id = ? AND tenant_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 1").bind(c.req.param("serviceId"), access.auth.tenantId, c.req.param("projectId")).first<{ id: string }>();
  if (!widget) return jsonError(c, "NOT_FOUND", "Save the widget first.", 404);
  const result = await auditMutation(c, access.auth, "widget.status." + parsed.data.status, "web_widget", widget.id, c.env.DB.prepare("UPDATE web_widgets SET status = ?, updated_at = ? WHERE id = (SELECT id FROM web_widgets WHERE chat_service_id = ? AND tenant_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 1)")
    .bind(parsed.data.status, now(), c.req.param("serviceId"), access.auth.tenantId, c.req.param("projectId")));
  if (!result.meta.changes) return jsonError(c, "NOT_FOUND", "Save the widget first.", 404);
  return c.json({ status: parsed.data.status });
});
router.post(`${scope}/preview`, async (c) => {
  const access = await setupScope(c); if (access.error) return access.error;
  const parsed = z.object({ input: z.string().trim().min(1).max(4000), behavior: widgetBehaviorSchema.optional() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return jsonError(c, "INVALID_REQUEST", "Enter a message up to 4,000 characters.");
  if (!await takeRate(c, `preview:${access.auth.tenantId}`, 10)) return jsonError(c, "RATE_LIMIT", "Please wait before testing again.", 429);
  return executeResponse(c, access.auth, c.req.param("projectId"), { input: parsed.data.input, chat_service_id: c.req.param("serviceId"), stream: false }, { requestId: id("preview"), channel: "web", ...(parsed.data.behavior ? { widgetBehavior: parsed.data.behavior } : {}) });
});

// This namespace has its own exact, tenant-configured origin allowlist. It never
// permits dashboard cookies or reuses the application's authenticated CORS policy.
router.use("/v1/widgets/:widgetId/*", async (c, next) => {
  c.header("Cache-Control", "no-store"); c.header("Vary", "Origin");
  const widget = await c.env.DB.prepare("SELECT w.* FROM web_widgets w JOIN chat_services s ON s.id = w.chat_service_id AND s.tenant_id = w.tenant_id AND s.project_id = w.project_id WHERE w.id = ? AND w.status = 'active'")
    .bind(c.req.param("widgetId")).first<Widget>();
  const origin = c.req.header("Origin");
  if (!widget || !origin || origin !== JSON.parse(widget.config_json).origin) return jsonError(c, "WIDGET_UNAVAILABLE", "Chat is unavailable on this website.", 403);
  c.header("Access-Control-Allow-Origin", origin);
  c.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  // Resolve again in handlers instead of accepting tenant identifiers from input.
  await next();
});
router.post("/v1/widgets/:widgetId/sessions", async (c) => {
  const widget = await c.env.DB.prepare("SELECT * FROM web_widgets WHERE id = ? AND status = 'active'").bind(c.req.param("widgetId")).first<Widget>();
  if (!widget) return jsonError(c, "WIDGET_UNAVAILABLE", "Chat is inactive.", 403);
  if(!await featureAllowed(c.env.DB,'channel.web',widget.tenant_id))return jsonError(c,'FEATURE_UNAVAILABLE','Web Chat is currently unavailable.',403);
  if (!await takeRate(c, `sessions:${widget.id}`, 60)) return jsonError(c, "RATE_LIMIT", "Chat is busy. Please try again shortly.", 429);
  const token = id("visitor");
  const conversationId = id('conv');
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM web_widget_sessions WHERE expires_at < ?").bind(now()),
    c.env.DB.prepare("DELETE FROM channel_rate_limits WHERE window < ?").bind(now() - 86400000),
    c.env.DB.prepare("INSERT INTO web_widget_sessions (token_hash, widget_id, origin, conversation_id, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(await sha256(token), widget.id, c.req.header("Origin")!, conversationId, now() + 1800000),
  ]);
  const { origin, title, welcome, color, position } = JSON.parse(widget.config_json);
  const forms=await featureAllowed(c.env.DB,'forms',widget.tenant_id)?(await c.env.DB.prepare(`SELECT f.id,json_extract(v.schema_json,'$.title') AS title FROM interactive_forms f JOIN form_versions v ON v.form_id=f.id AND v.version=f.published_version WHERE f.tenant_id=? AND f.project_id=? AND f.service_id=? AND f.active=1 AND json_extract(v.schema_json,'$.show_in_widget')=1 LIMIT 10`).bind(widget.tenant_id,widget.project_id,widget.chat_service_id).all()).results:[];
  return c.json({ token, conversation_id:conversationId, config: { origin, title, welcome, color, position, forms }, expires_in: 1800 });
});
router.post("/v1/widgets/:widgetId/messages", async (c) => {
  const parsed = z.object({ input: z.string().trim().min(1).max(4000), message_id: z.string().uuid(), business_identity:z.string().max(8000).optional() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return jsonError(c, "INVALID_REQUEST", "Enter a message up to 4,000 characters.");
  const token = c.req.header("Authorization")?.replace(/^Bearer /, "") || "";
  if (!/^visitor_[a-f0-9]{32}$/.test(token)) return jsonError(c, "SESSION_EXPIRED", "Restart chat to continue.", 401);
  const hash = await sha256(token);
  const session = await c.env.DB.prepare(`SELECT v.conversation_id, w.* FROM web_widget_sessions v JOIN web_widgets w ON w.id = v.widget_id
    WHERE v.token_hash = ? AND v.widget_id = ? AND v.origin = ? AND v.expires_at > ? AND w.status = 'active'`)
    .bind(hash, c.req.param("widgetId"), c.req.header("Origin")!, now()).first<Widget & { conversation_id: string }>();
  if (!session) return jsonError(c, "SESSION_EXPIRED", "Restart chat to continue.", 401);
  if (!await takeRate(c, `message:${hash}`, 10) || !await takeRate(c, `widget:${session.id}`, 120)) return jsonError(c, "RATE_LIMIT", "Please wait before sending another message.", 429);
  const lock = await c.env.DB.prepare("UPDATE web_widget_sessions SET locked_until = ? WHERE token_hash = ? AND locked_until = 0")
    .bind(now(), hash).run();
  if (!lock.meta.changes) return jsonError(c, "CHAT_BUSY", "Please wait for the previous reply.", 409);
  try {
    let subjects:Record<string,string>;
    try {subjects=await verifyBusinessIdentity(c.env.SESSION_SECRET,parsed.data.business_identity,{tenant:session.tenant_id,project:session.project_id,service:session.chat_service_id,conversation:session.conversation_id});}
    catch {return jsonError(c,'INVALID_CUSTOMER_IDENTITY','Please verify your account again.',401);}
    const identityHash=Object.keys(subjects).length ? await sha256(JSON.stringify(Object.entries(subjects).sort(([a],[b])=>a.localeCompare(b)))) : null;
    const bound=await c.env.DB.prepare('SELECT business_identity_hash FROM web_widget_sessions WHERE token_hash=?').bind(hash).first<{business_identity_hash:string|null}>();
    if(bound?.business_identity_hash && bound.business_identity_hash!==identityHash)return jsonError(c,'IDENTITY_CHANGED','Restart chat to change accounts, or renew verification.',401);
    if(identityHash&&!bound?.business_identity_hash)await c.env.DB.prepare('UPDATE web_widget_sessions SET business_identity_hash=? WHERE token_hash=?').bind(identityHash,hash).run();
    const history = await c.env.DB.prepare(`SELECT m.role, m.content FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.id = ? AND c.tenant_id = ? AND c.project_id = ? AND m.role IN ('user','assistant') ORDER BY m.created_at DESC LIMIT 12`)
      .bind(session.conversation_id, session.tenant_id, session.project_id).all<{ role: string; content: string }>();
    const response = await executeResponse(c, { tenantId: session.tenant_id, userId: "widget", role: "api" }, session.project_id,
      { input: parsed.data.input, business_identity:parsed.data.business_identity, conversation_id: session.conversation_id, chat_service_id: session.chat_service_id, stream: false },
      { requestId: `widget_${hash.slice(0, 24)}_${parsed.data.message_id}`, channel: "web", widgetBehavior: widgetBehaviorSchema.parse(JSON.parse(session.config_json)), history: history.results.reverse().map((item) => ({ ...item, content: item.content.slice(0, 4000) })) });
    // Visitors receive text, not internal billing/provider metadata.
    const data = await response.json() as any;
    return c.json(response.ok ? { output_text: data.output_text } : { error: data.error }, response.status as any);
  } finally {
    await c.env.DB.prepare("UPDATE web_widget_sessions SET locked_until = 0 WHERE token_hash = ?").bind(hash).run();
  }
});
export const webWidgetRoutes = router;
