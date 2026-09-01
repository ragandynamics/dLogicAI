import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types";
import { id, now, jsonError } from "../utils/common";
import { requireDashboard } from "../utils/auth";
import { canManageTenantServices } from "../tenant-roles";
import { getOwnedProject } from "../services/channels";

const router = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

router.get("/v1/projects/:projectId/chat-services", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  if (!canManageTenantServices(auth.role)) {
    return jsonError(
      c,
      "FORBIDDEN",
      "Tenant members with workspace access can manage services.",
      403
    );
  }

  const project = await getOwnedProject(
    c,
    c.req.param("projectId"),
    auth.tenantId
  );
  if (!project) return jsonError(c, "NOT_FOUND", "Project not found.", 404);

  const services = await c.env.DB.prepare(
    `SELECT id, project_id, name, description, environment, status,
      default_language, ai_provider, model, provider_mode, provider_credential_id, enable_intelligence,
        enable_emotion_analysis, enable_upsell_analysis, created_at, updated_at
     FROM chat_services
     WHERE project_id = ? AND tenant_id = ?
     ORDER BY created_at DESC`
  )
    .bind(project.id, auth.tenantId)
    .all();

  return c.json({ chat_services: services.results });
});

router.post("/v1/projects/:projectId/chat-services", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  if (!canManageTenantServices(auth.role)) {
    return jsonError(
      c,
      "FORBIDDEN",
      "Tenant members with workspace access can manage services.",
      403
    );
  }

  const project = await getOwnedProject(
    c,
    c.req.param("projectId"),
    auth.tenantId
  );
  if (!project) return jsonError(c, "NOT_FOUND", "Project not found.", 404);

  const parsed = z
    .object({
      name: z.string().trim().min(1).max(120),
      description: z.string().trim().max(500).optional().nullable(),
      default_language: z.string().trim().min(1).max(32).default("auto"),
      ai_provider: z.enum(["auto", "openai", "google"]).default("auto"),
      model: z.string().trim().min(1).max(120).default("auto"),
      provider_mode: z.enum(["managed", "tenant"]).default("managed"),
      provider_credential_id: z.string().trim().max(120).optional().nullable(),
      enable_intelligence: z.boolean().default(true),
      enable_emotion_analysis: z.boolean().default(true),
      enable_upsell_analysis: z.boolean().default(true),
    })
    .safeParse(await c.req.json().catch(() => ({})));

  if (!parsed.success) {
    return jsonError(
      c,
      "INVALID_REQUEST",
      "Invalid Chat Service configuration.",
      400
    );
  }

  const serviceId = id("svc");
  const timestamp = now();
  await c.env.DB.prepare(
    `INSERT INTO chat_services
      (id, tenant_id, project_id, name, description, environment, status,
       default_language, ai_provider, model, provider_mode, provider_credential_id, enable_intelligence,
       enable_emotion_analysis, enable_upsell_analysis, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      serviceId,
      auth.tenantId,
      project.id,
      parsed.data.name,
      parsed.data.description || null,
      project.environment,
      parsed.data.default_language,
      parsed.data.ai_provider,
      parsed.data.model,
      parsed.data.provider_mode,
      parsed.data.provider_credential_id || null,
      parsed.data.enable_intelligence ? 1 : 0,
      parsed.data.enable_emotion_analysis ? 1 : 0,
      parsed.data.enable_upsell_analysis ? 1 : 0,
      timestamp,
      timestamp
    )
    .run();

  return c.json(
    {
      chat_service: {
        id: serviceId,
        project_id: project.id,
        ...parsed.data,
        environment: project.environment,
        status: "active",
        created_at: timestamp,
        updated_at: timestamp,
      },
    },
    201
  );
});

router.get("/v1/projects/:projectId/chat-services/:serviceId", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

  const service = await c.env.DB.prepare(
    `SELECT id, project_id, name, description, environment, status,
      default_language, ai_provider, model, provider_mode, provider_credential_id, enable_intelligence,
        enable_emotion_analysis, enable_upsell_analysis, created_at, updated_at
     FROM chat_services
     WHERE id = ? AND project_id = ? AND tenant_id = ?`
  )
    .bind(
      c.req.param("serviceId"),
      c.req.param("projectId"),
      auth.tenantId
    )
    .first();

  if (!service) return jsonError(c, "NOT_FOUND", "Chat Service not found.", 404);
  return c.json({ chat_service: service });
});

router.patch("/v1/projects/:projectId/chat-services/:serviceId", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  if (!canManageTenantServices(auth.role)) {
    return jsonError(
      c,
      "FORBIDDEN",
      "Tenant members with workspace access can manage services.",
      403
    );
  }

  const parsed = z
    .object({
      name: z.string().trim().min(1).max(120),
      description: z.string().trim().max(500).optional().nullable(),
      default_language: z.string().trim().min(1).max(32),
      ai_provider: z.enum(["auto", "openai", "google"]),
      model: z.string().trim().min(1).max(120),
      provider_mode: z.enum(["managed", "tenant"]),
      provider_credential_id: z.string().trim().max(120).optional().nullable(),
      enable_intelligence: z.boolean(),
      enable_emotion_analysis: z.boolean(),
      enable_upsell_analysis: z.boolean(),
    })
    .safeParse(await c.req.json().catch(() => ({})));

  if (!parsed.success) {
    return jsonError(
      c,
      "INVALID_REQUEST",
      "Invalid Chat Service configuration.",
      400
    );
  }

  const result = await c.env.DB.prepare(
    `UPDATE chat_services
     SET name = ?, description = ?, default_language = ?, ai_provider = ?, model = ?, provider_mode = ?, provider_credential_id = ?,
       enable_intelligence = ?, enable_emotion_analysis = ?, enable_upsell_analysis = ?, updated_at = ?
     WHERE id = ? AND project_id = ? AND tenant_id = ?`
  )
    .bind(
      parsed.data.name,
      parsed.data.description || null,
      parsed.data.default_language,
      parsed.data.ai_provider,
      parsed.data.model,
      parsed.data.provider_mode,
      parsed.data.provider_credential_id || null,
      parsed.data.enable_intelligence ? 1 : 0,
      parsed.data.enable_emotion_analysis ? 1 : 0,
      parsed.data.enable_upsell_analysis ? 1 : 0,
      now(),
      c.req.param("serviceId"),
      c.req.param("projectId"),
      auth.tenantId
    )
    .run();

  if (!result.meta.changes) {
    return jsonError(c, "NOT_FOUND", "Chat Service not found.", 404);
  }
  return c.json({ ok: true });
});

router.delete("/v1/projects/:projectId/chat-services/:serviceId", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  if (!canManageTenantServices(auth.role)) {
    return jsonError(
      c,
      "FORBIDDEN",
      "Tenant members with workspace access can manage services.",
      403
    );
  }

  const result = await c.env.DB.prepare(
    `DELETE FROM chat_services WHERE id = ? AND project_id = ? AND tenant_id = ?`
  )
    .bind(
      c.req.param("serviceId"),
      c.req.param("projectId"),
      auth.tenantId
    )
    .run();

  if (!result.meta.changes) {
    return jsonError(c, "NOT_FOUND", "Chat Service not found.", 404);
  }
  return c.json({ ok: true });
});

router.get(
  "/v1/projects/:projectId/chat-services/:serviceId/channels",
  async (c) => {
    const auth = await requireDashboard(c);
    if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

    const service = await c.env.DB.prepare(
      `SELECT id FROM chat_services WHERE id = ? AND project_id = ? AND tenant_id = ?`
    )
      .bind(
        c.req.param("serviceId"),
        c.req.param("projectId"),
        auth.tenantId
      )
      .first();
    if (!service) return jsonError(c, "NOT_FOUND", "Chat Service not found.", 404);

    const channels = await c.env.DB.prepare(
      `SELECT id, channel, config_json, status, created_at, updated_at
     FROM chat_service_channels WHERE chat_service_id = ? AND tenant_id = ? ORDER BY created_at DESC`
    )
      .bind(c.req.param("serviceId"), auth.tenantId)
      .all();
    return c.json({
      channels: channels.results.map((channel) => ({
        ...channel,
        config: JSON.parse(String(channel.config_json || "{}")),
      })),
    });
  }
);

router.put(
  "/v1/projects/:projectId/chat-services/:serviceId/channels/:channel",
  async (c) => {
    const auth = await requireDashboard(c);
    if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
    const channel = c.req.param("channel");
    if (channel !== "web") {
      return jsonError(c, "INVALID_REQUEST", "Unsupported channel.", 400);
    }

    const service = await c.env.DB.prepare(
      `SELECT id FROM chat_services WHERE id = ? AND project_id = ? AND tenant_id = ?`
    )
      .bind(
        c.req.param("serviceId"),
        c.req.param("projectId"),
        auth.tenantId
      )
      .first();
    if (!service) return jsonError(c, "NOT_FOUND", "Chat Service not found.", 404);

    const parsed = z
      .object({ domain: z.string().trim().max(255).optional().default("") })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonError(c, "INVALID_REQUEST", "Invalid channel configuration.", 400);
    }

    const timestamp = now();
    await c.env.DB.prepare(
      `INSERT INTO chat_service_channels (id, tenant_id, project_id, chat_service_id, channel, config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat_service_id, channel) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at`
    )
      .bind(
        id("chn"),
        auth.tenantId,
        c.req.param("projectId"),
        c.req.param("serviceId"),
        channel,
        JSON.stringify(parsed.data),
        timestamp,
        timestamp
      )
      .run();

    return c.json({ ok: true, channel, config: parsed.data });
  }
);

export const chatServiceRoutes = router;
