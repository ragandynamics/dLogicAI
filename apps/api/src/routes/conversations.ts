import { Hono } from "hono";
import { z } from "zod";
import type { ChannelQueueMessage, Env, HonoVariables } from "../types";
import { id, now, jsonError } from "../utils/common";
import { requireDashboard } from "../utils/auth";
import { canAccessTenantLogs } from "../tenant-roles";
import { sendChannelDelivery } from "../services/channels";
import type { Channel } from "../integrations/channel-types";

const router = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

router.patch("/v1/conversations/:id/auto-response", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  const parsed = z
    .object({ paused: z.boolean() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(c, "INVALID_REQUEST", "paused must be a boolean.", 400);
  }
  const timestamp = now();
  const result = await c.env.DB.prepare(
    `UPDATE conversations SET auto_response_paused = ?, paused_by = ?, paused_at = ?, updated_at = ?
     WHERE id = ? AND tenant_id = ?`
  )
    .bind(
      parsed.data.paused ? 1 : 0,
      parsed.data.paused ? auth.userId : null,
      parsed.data.paused ? timestamp : null,
      timestamp,
      c.req.param("id"),
      auth.tenantId
    )
    .run();
  if (!result.meta.changes) {
    return jsonError(c, "NOT_FOUND", "Conversation not found.", 404);
  }
  return c.json({ ok: true, paused: parsed.data.paused });
});

router.post("/v1/conversations/:id/messages", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  const parsed = z
    .object({ content: z.string().trim().min(1).max(10000) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(c, "INVALID_REQUEST", "Message content is required.", 400);
  }
  const conversation = await c.env.DB.prepare(
    "SELECT id FROM conversations WHERE id = ? AND tenant_id = ?"
  )
    .bind(c.req.param("id"), auth.tenantId)
    .first();
  if (!conversation) return jsonError(c, "NOT_FOUND", "Conversation not found.", 404);
  const timestamp = now();
  const messageId = id("msg");
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO messages (id, conversation_id, role, content, input_tokens, output_tokens, created_at) VALUES (?, ?, 'agent', ?, 0, 0, ?)"
    ).bind(messageId, c.req.param("id"), parsed.data.content, timestamp),
    c.env.DB.prepare(
      "UPDATE conversations SET updated_at = ? WHERE id = ? AND tenant_id = ?"
    ).bind(timestamp, c.req.param("id"), auth.tenantId),
  ]);
  const mapping = await c.env.DB.prepare(
    `SELECT installation_id, external_conversation_id, channel
     FROM channel_conversations WHERE conversation_id = ? AND tenant_id = ? LIMIT 1`
  )
    .bind(c.req.param("id"), auth.tenantId)
    .first<{
      installation_id: string;
      external_conversation_id: string;
      channel: Channel;
    }>();
  if (mapping) {
    const deliveryId = id("deliv");
    await c.env.DB.prepare(
      `INSERT INTO channel_deliveries (id, tenant_id, installation_id, conversation_id, channel, direction, status, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, 'outbound', 'queued', ?, ?)`
    )
      .bind(
        deliveryId,
        auth.tenantId,
        mapping.installation_id,
        c.req.param("id"),
        mapping.channel,
        JSON.stringify({
          external_conversation_id: mapping.external_conversation_id,
          text: parsed.data.content,
        }),
        timestamp
      )
      .run();
    const delivery = await sendChannelDelivery(c, deliveryId);
    if (!delivery.ok && delivery.retryable && c.env.CHANNEL_QUEUE) {
      c.executionCtx.waitUntil(
        c.env.CHANNEL_QUEUE.send(
          {
            type: "channel.outbound",
            tenantId: auth.tenantId,
            installationId: mapping.installation_id,
            conversationId: c.req.param("id"),
            text: parsed.data.content,
            deliveryId,
            attempt: delivery.attempt,
          } satisfies ChannelQueueMessage,
          {
            delaySeconds: Math.min(60, 2 ** Number(delivery.attempt || 1)),
          }
        )
      );
    }
  }
  return c.json(
    {
      message: {
        id: messageId,
        conversation_id: c.req.param("id"),
        role: "agent",
        content: parsed.data.content,
        created_at: timestamp,
      },
    },
    201
  );
});

router.get("/v1/usage", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

  let days = Number(c.req.query("days") || 30);
  if (!Number.isFinite(days)) {
    days = 30;
  }
  days = Math.min(Math.max(Math.floor(days), 1), 365);

  const since = now() - days * 86400000;

  const summary = await c.env.DB.prepare(
    `
    SELECT
      COUNT(*) AS requests,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(provider_cost_micros), 0) AS provider_cost_micros,
      COALESCE(SUM(customer_charge_micros), 0) AS customer_charge_micros
    FROM usage_events
    WHERE tenant_id = ?
      AND created_at >= ?
      AND status = 'completed'
    `
  )
    .bind(auth.tenantId, since)
    .first();

  const byProvider = await c.env.DB.prepare(
    `
    SELECT
      provider,
      billing_mode,
      COUNT(*) AS requests,
      COALESCE(SUM(provider_cost_micros), 0) AS provider_cost_micros,
      COALESCE(SUM(customer_charge_micros), 0) AS customer_charge_micros
    FROM usage_events
    WHERE tenant_id = ?
      AND created_at >= ?
      AND status = 'completed'
    GROUP BY
      provider,
      billing_mode
    `
  )
    .bind(auth.tenantId, since)
    .all();

  return c.json({
    summary,
    by_provider: byProvider.results,
  });
});

router.get("/v1/conversations", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

  if (!canAccessTenantLogs(auth.role)) {
    return jsonError(
      c,
      "FORBIDDEN",
      "Tenant members with workspace access can view logs.",
      403
    );
  }

  const rows = await c.env.DB.prepare(
    `
    SELECT
      c.id,
      c.project_id,
      p.name AS project_name,
      c.title,
      c.model,
      c.language,
      c.locale,
      c.auto_response_paused,
      c.paused_by,
      c.paused_at,
      c.created_at,
      c.updated_at,
      i.sentiment,
      i.emotion,
      i.frustration_score,
      i.urgency_score,
      i.purchase_intent_score,
      i.escalation_risk_score
    FROM conversations c
    LEFT JOIN projects p ON p.id = c.project_id AND p.tenant_id = c.tenant_id
    LEFT JOIN conversation_intelligence i ON i.id = (
      SELECT latest.id FROM conversation_intelligence latest
      WHERE latest.conversation_id = c.id
      ORDER BY latest.created_at DESC LIMIT 1
    )
    WHERE c.tenant_id = ?
    ORDER BY c.updated_at DESC
    LIMIT 100
    `
  )
    .bind(auth.tenantId)
    .all();

  return c.json({
    conversations: rows.results,
  });
});

router.get("/v1/conversations/:id", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

  if (!canAccessTenantLogs(auth.role)) {
    return jsonError(
      c,
      "FORBIDDEN",
      "Tenant members with workspace access can view logs.",
      403
    );
  }

  const conversationId = c.req.param("id");

  const conversation = await c.env.DB.prepare(
    `
    SELECT *
    FROM conversations
    WHERE id = ?
      AND tenant_id = ?
    `
  )
    .bind(conversationId, auth.tenantId)
    .first();

  if (!conversation) {
    return jsonError(c, "NOT_FOUND", "Conversation not found.", 404);
  }

  const messages = await c.env.DB.prepare(
    `
    SELECT
      id,
      role,
      content,
      input_tokens,
      output_tokens,
      created_at
    FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
    `
  )
    .bind(conversationId)
    .all();

  const intelligence = await c.env.DB.prepare(
    `SELECT * FROM conversation_intelligence
     WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1`
  )
    .bind(conversationId)
    .first();

  return c.json({
    conversation,
    messages: messages.results,
    intelligence: intelligence || null,
  });
});

router.get("/v1/conversations/:id/flow-progress", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  const state = await c.env.DB.prepare(
    `SELECT conversation_id, project_id, chat_service_id, flow_version_id,
            current_state_key, retry_count, slots_json, milestones_json, updated_at
     FROM conversation_flow_state
     WHERE conversation_id = ? AND tenant_id = ?`
  )
    .bind(c.req.param("id"), auth.tenantId)
    .first<any>();
  if (!state) return jsonError(c, "NOT_FOUND", "Conversation flow state not found.", 404);
  const outcomes = await c.env.DB.prepare(
    `SELECT outcome_key, status, evidence_json, created_at
     FROM conversation_outcome_events
     WHERE conversation_id = ? AND tenant_id = ? ORDER BY created_at DESC`
  )
    .bind(c.req.param("id"), auth.tenantId)
    .all();
  return c.json({
    flow_progress: {
      ...state,
      slots: JSON.parse(state.slots_json || "{}"),
      milestones: JSON.parse(state.milestones_json || "[]"),
      outcomes: outcomes.results.map((outcome: any) => ({
        ...outcome,
        evidence: JSON.parse(outcome.evidence_json || "{}"),
      })),
    },
  });
});

router.get("/v1/tenant/logs", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  if (!canAccessTenantLogs(auth.role)) {
    return jsonError(
      c,
      "FORBIDDEN",
      "Tenant members with workspace access can view logs.",
      403
    );
  }

  const projectId = c.req.query("project_id")?.trim();
  const limit = Math.min(
    Math.max(Number(c.req.query("limit") || 100), 1),
    500
  );

  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.project_id, p.name AS project_name, c.title, c.model, c.language, c.locale, c.created_at, c.updated_at,
            (SELECT json_group_array(json_object('role', m.role, 'content', m.content, 'created_at', m.created_at))
             FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at ASC) AS message_log
     FROM conversations c
     LEFT JOIN projects p ON p.id = c.project_id AND p.tenant_id = c.tenant_id
     WHERE c.tenant_id = ? ${projectId ? "AND c.project_id = ?" : ""}
     ORDER BY c.updated_at DESC LIMIT ?`
  )
    .bind(
      ...(projectId
        ? [auth.tenantId, projectId, limit]
        : [auth.tenantId, limit])
    )
    .all();

  const format = (c.req.query("format") || "json").toLowerCase();
  const records = rows.results.map((row) => ({
    ...row,
    message_log: row.message_log ? JSON.parse(String(row.message_log)) : [],
  }));

  if (format === "csv") {
    const headers = [
      "id",
      "project_id",
      "project_name",
      "title",
      "model",
      "language",
      "locale",
      "created_at",
      "updated_at",
      "message_log",
    ];
    const csv = [headers.join(",")]
      .concat(
        records.map((row) =>
          headers
            .map((header) => {
              const value =
                header === "message_log"
                  ? JSON.stringify(row.message_log)
                  : row[header as keyof typeof row];
              const normalized = String(value ?? "").replace(/"/g, '""');
              return `"${normalized}"`;
            })
            .join(",")
        )
      )
      .join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tenant-logs-${Date.now()}.csv"`,
      },
    });
  }

  return c.json({ logs: records });
});

export const conversationRoutes = router;
