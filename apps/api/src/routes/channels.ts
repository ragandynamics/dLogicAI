import { Hono } from "hono";
import { z } from "zod";
import type {
  ChannelQueueMessage,
  Env,
  HonoVariables,
} from "../types";
import { id, now, jsonError } from "../utils/common";
import { encryptText, decryptText, sha256 } from "../utils/crypto";
import { requireDashboard } from "../utils/auth";
import { canManageTenantServices } from "../tenant-roles";
import { channelAdapters } from "../integrations/channel-adapters";
import type {
  Channel,
  ChannelInstallation,
} from "../integrations/channel-types";

const router = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

router.get(
  "/v1/projects/:projectId/chat-services/:serviceId/channel-installations",
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
    const installations = await c.env.DB.prepare(
      `SELECT id, channel, external_account_id, status, created_at, updated_at
     FROM channel_installations WHERE tenant_id = ? AND project_id = ? AND chat_service_id = ? ORDER BY created_at DESC`
    )
      .bind(
        auth.tenantId,
        c.req.param("projectId"),
        c.req.param("serviceId")
      )
      .all();
    return c.json({ installations: installations.results });
  }
);

router.post(
  "/v1/projects/:projectId/chat-services/:serviceId/channel-installations",
  async (c) => {
    const auth = await requireDashboard(c);
    if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
    if (!canManageTenantServices(auth.role)) {
      return jsonError(c, "FORBIDDEN", "Tenant workspace access is required.", 403);
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
      .object({
        channel: z.enum(["telegram", "whatsapp"]),
        external_account_id: z.string().trim().min(1).max(200),
        credentials: z.record(z.string(), z.string()).default({}),
        webhook_secret: z.string().min(16).max(255).optional(),
      })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonError(
        c,
        "INVALID_REQUEST",
        "Channel, external account ID, and credentials are required.",
        400
      );
    }
    if (
      parsed.data.channel === "whatsapp" &&
      (!parsed.data.credentials.app_secret || !parsed.data.webhook_secret)
    ) {
      return jsonError(
        c,
        "INVALID_REQUEST",
        "WhatsApp app_secret and webhook_secret are required.",
        400
      );
    }
    if (parsed.data.channel === "telegram" && !parsed.data.webhook_secret) {
      return jsonError(
        c,
        "INVALID_REQUEST",
        "Telegram webhook_secret is required.",
        400
      );
    }

    const timestamp = now();
    const installationId = id("install");
    const encryptedCredentials = await encryptText(
      JSON.stringify(parsed.data.credentials),
      c.env.MASTER_KEY
    );
    const webhookSecretHash = parsed.data.webhook_secret
      ? await sha256(parsed.data.webhook_secret)
      : null;
    try {
      await c.env.DB.prepare(
        `INSERT INTO channel_installations
       (id, tenant_id, project_id, chat_service_id, channel, external_account_id, encrypted_credentials, webhook_secret_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          installationId,
          auth.tenantId,
          c.req.param("projectId"),
          c.req.param("serviceId"),
          parsed.data.channel,
          parsed.data.external_account_id,
          encryptedCredentials,
          webhookSecretHash,
          timestamp,
          timestamp
        )
        .run();
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) {
        return jsonError(
          c,
          "ALREADY_EXISTS",
          "This channel account is already installed for the project.",
          409
        );
      }
      throw error;
    }
    return c.json(
      {
        installation: {
          id: installationId,
          channel: parsed.data.channel,
          external_account_id: parsed.data.external_account_id,
          status: "active",
          created_at: timestamp,
        },
      },
      201
    );
  }
);

router.delete(
  "/v1/projects/:projectId/chat-services/:serviceId/channel-installations/:installationId",
  async (c) => {
    const auth = await requireDashboard(c);
    if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
    if (!canManageTenantServices(auth.role)) {
      return jsonError(c, "FORBIDDEN", "Tenant workspace access is required.", 403);
    }
    const result = await c.env.DB.prepare(
      `DELETE FROM channel_installations WHERE id = ? AND tenant_id = ? AND project_id = ? AND chat_service_id = ?`
    )
      .bind(
        c.req.param("installationId"),
        auth.tenantId,
        c.req.param("projectId"),
        c.req.param("serviceId")
      )
      .run();
    if (!result.meta.changes) {
      return jsonError(c, "NOT_FOUND", "Channel installation not found.", 404);
    }
    return c.json({ deleted: true });
  }
);

router.get("/v1/webhooks/channels/whatsapp/:installationId", async (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token") || "";
  const challenge = c.req.query("hub.challenge") || "";
  const installation = await c.env.DB.prepare(
    `SELECT webhook_secret_hash FROM channel_installations WHERE id = ? AND channel = 'whatsapp' AND status = 'active'`
  )
    .bind(c.req.param("installationId"))
    .first<{ webhook_secret_hash: string | null }>();
  if (
    mode !== "subscribe" ||
    !installation?.webhook_secret_hash ||
    (await sha256(token)) !== installation.webhook_secret_hash
  ) {
    return c.text("Forbidden", 403);
  }
  return c.text(challenge);
});

router.post("/v1/webhooks/channels/:channel/:installationId", async (c) => {
  const channel = c.req.param("channel") as Channel;
  const adapter = channelAdapters.get(channel);
  if (!adapter) return jsonError(c, "NOT_FOUND", "Channel adapter not found.", 404);
  const installation = await c.env.DB.prepare(
    `SELECT id, tenant_id, project_id, chat_service_id, channel, external_account_id, encrypted_credentials, webhook_secret_hash, status
     FROM channel_installations WHERE id = ? AND channel = ? AND status = 'active'`
  )
    .bind(c.req.param("installationId"), channel)
    .first<ChannelInstallation>();
  if (!installation) return jsonError(c, "NOT_FOUND", "Channel installation not found.", 404);
  const rawBody = await c.req.text();
  let credentials: Record<string, string> = {};
  try {
    credentials = JSON.parse(
      await decryptText(
        installation.encrypted_credentials,
        c.env.MASTER_KEY
      )
    );
  } catch {
    return jsonError(
      c,
      "CHANNEL_CONFIGURATION_ERROR",
      "Channel credentials are unavailable.",
      503
    );
  }
  if (
    !(await adapter.verifyWebhook(
      c.req.raw,
      installation,
      rawBody,
      credentials
    ))
  ) {
    return jsonError(
      c,
      "INVALID_SIGNATURE",
      "Channel webhook signature is invalid.",
      401
    );
  }
  const events = adapter.parseInbound(rawBody);
  const payloadHash = await sha256(rawBody);
  const acceptedEvents: string[] = [];
  const externalEventIds = events.length
    ? [...new Set(events.map((event) => event.external_message_id))]
    : [payloadHash];
  for (const externalEventId of externalEventIds) {
    try {
      const inserted = await c.env.DB.prepare(
        `INSERT OR IGNORE INTO channel_events (id, tenant_id, installation_id, channel, external_event_id, event_type, payload_hash, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          id("event"),
          installation.tenant_id,
          installation.id,
          channel,
          externalEventId,
          "message",
          payloadHash,
          now()
        )
        .run();
      if (Number(inserted.meta.changes || 0) === 1) {
        acceptedEvents.push(externalEventId);
      }
    } catch (error) {
      throw error;
    }
  }

  for (const event of events.filter((candidate) =>
    acceptedEvents.includes(candidate.external_message_id)
  )) {
    let mapping = await c.env.DB.prepare(
      `SELECT conversation_id FROM channel_conversations
       WHERE installation_id = ? AND external_conversation_id = ? AND tenant_id = ?`
    )
      .bind(
        installation.id,
        event.external_conversation_id,
        installation.tenant_id
      )
      .first<{ conversation_id: string }>();
    const timestamp = now();
    if (!mapping) {
      const conversationId = id("conv");
      await c.env.DB.batch([
        c.env.DB.prepare(
          `INSERT INTO conversations (id, tenant_id, project_id, external_id, title, model, language, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'auto', 'auto', 'active', ?, ?)`
        ).bind(
          conversationId,
          installation.tenant_id,
          installation.project_id,
          `${channel}:${event.external_conversation_id}`,
          (event.text || "New channel conversation").slice(0, 100),
          timestamp,
          timestamp
        ),
        c.env.DB.prepare(
          `INSERT INTO channel_conversations (id, tenant_id, project_id, chat_service_id, installation_id, external_conversation_id, conversation_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          id("cconv"),
          installation.tenant_id,
          installation.project_id,
          installation.chat_service_id,
          installation.id,
          event.external_conversation_id,
          conversationId,
          timestamp,
          timestamp
        ),
      ]);
      mapping = { conversation_id: conversationId };
    }

    if (event.text) {
      const messageId = id("msg");
      await c.env.DB.batch([
        c.env.DB.prepare(
          `INSERT INTO messages (id, conversation_id, role, content, input_tokens, output_tokens, created_at)
           VALUES (?, ?, 'user', ?, 0, 0, ?)`
        ).bind(messageId, mapping.conversation_id, event.text, timestamp),
        c.env.DB.prepare(
          "UPDATE conversations SET updated_at = ? WHERE id = ? AND tenant_id = ?"
        ).bind(timestamp, mapping.conversation_id, installation.tenant_id),
        c.env.DB.prepare(
          "UPDATE channel_conversations SET updated_at = ? WHERE installation_id = ? AND external_conversation_id = ? AND tenant_id = ?"
        ).bind(
          timestamp,
          installation.id,
          event.external_conversation_id,
          installation.tenant_id
        ),
      ]);
      const queueMessage: ChannelQueueMessage = {
        type: "channel.inbound",
        tenantId: installation.tenant_id,
        installationId: installation.id,
        conversationId: mapping.conversation_id,
        messageId,
        text: event.text,
      };
      if (c.env.CHANNEL_QUEUE) {
        c.executionCtx.waitUntil(c.env.CHANNEL_QUEUE.send(queueMessage));
      }
    }
    await c.env.DB.prepare(
      `UPDATE channel_events SET status = 'processed', processed_at = ?
       WHERE installation_id = ? AND external_event_id = ? AND tenant_id = ?`
    )
      .bind(
        timestamp,
        installation.id,
        event.external_message_id,
        installation.tenant_id
      )
      .run();
  }

  return c.json({
    received: true,
    accepted: acceptedEvents.length,
    duplicate_safe: true,
  });
});

export const channelRoutes = router;
