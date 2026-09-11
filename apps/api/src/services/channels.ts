import { getGuardrails, limitReply } from "./platform-guardrails";
import { featureAllowed } from './platform-features';
import { businessContext } from './business-connectors';
import { retrieveKnowledgeContext } from './knowledge';
import type { AppContext, AuthContext, ChannelQueueMessage } from "../types";
import { channelAdapters } from "../integrations/channel-adapters";
import type { Channel } from "../integrations/channel-types";
import { decryptText } from "../utils/crypto";
import { id, now } from "../utils/common";
import {
  completeCreditReservation,
  refundCreditReservation,
  reserveCredits,
} from "./credits";
import { reserveUsage } from "./usage";
import {
  callGemini,
  MANAGED_GEMINI_MODEL,
  callOpenAI,
  estimatedCreditChargeMicros,
  MANAGED_MAX_OUTPUT_TOKENS,
  managedCustomerChargeMicros,
  resolveProvider,
} from "./providers";

type InboundResult = {
  ok: boolean;
  code?: string;
  deliveryId?: string;
  duplicate?: boolean;
};

function queueContext(env: AppContext["env"], auth: AuthContext): AppContext {
  return {
    env,
    get(key: string) {
      return key === "auth" ? auth : undefined;
    },
  } as unknown as AppContext;
}

async function markInboundEvent(
  c: AppContext,
  item: ChannelQueueMessage,
  status: "completed" | "failed",
  errorCode?: string
) {
  if (!item.eventId) return;
  await c.env.DB.prepare(
    `UPDATE channel_events SET status = ?, error_code = ?, processed_at = ?
     WHERE id = ? AND tenant_id = ? AND installation_id = ?`
  )
    .bind(status, errorCode || null, now(), item.eventId, item.tenantId, item.installationId)
    .run();
}

export async function processChannelInbound(
  env: AppContext["env"],
  item: ChannelQueueMessage
): Promise<InboundResult> {
  if (!item.conversationId || !item.messageId || !item.text) {
    return { ok: false, code: "CHANNEL_MESSAGE_INVALID" };
  }

  const installation = await env.DB.prepare(
    `SELECT i.id, i.tenant_id, i.project_id, i.chat_service_id, i.channel,
            cc.external_conversation_id, c.auto_response_paused
     FROM channel_installations i
     JOIN channel_conversations cc
       ON cc.installation_id = i.id AND cc.conversation_id = ? AND cc.tenant_id = i.tenant_id
     JOIN conversations c
       ON c.id = cc.conversation_id AND c.tenant_id = i.tenant_id
     WHERE i.id = ? AND i.tenant_id = ? AND i.status = 'active'`
  )
    .bind(item.conversationId, item.installationId, item.tenantId)
    .first<{
      id: string;
      tenant_id: string;
      project_id: string;
      chat_service_id: string;
      channel: Channel;
      external_conversation_id: string;
      auto_response_paused: number;
    }>();

  const auth: AuthContext = { userId: "channel-runtime", tenantId: item.tenantId, role: "service" };
  const c = queueContext(env, auth);
  if (!installation) {
    await markInboundEvent(c, item, "failed", "CHANNEL_INSTALLATION_NOT_FOUND");
    return { ok: false, code: "CHANNEL_INSTALLATION_NOT_FOUND" };
  }
  if (installation.auto_response_paused) {
    await markInboundEvent(c, item, "completed");
    return { ok: true, code: "AUTO_RESPONSE_PAUSED" };
  }

  const limits = await getGuardrails(env.DB, installation.channel);
  const conversation = await env.DB.prepare('SELECT created_at FROM conversations WHERE id=? AND tenant_id=?').bind(item.conversationId,item.tenantId).first<{created_at:number}>();
  if(!await featureAllowed(env.DB,'channel.'+installation.channel,item.tenantId,conversation?.created_at) || !await featureAllowed(env.DB,'chat.qa',item.tenantId,conversation?.created_at)) {
    await markInboundEvent(c,item,'failed','FEATURE_UNAVAILABLE');
    return {ok:false,code:'FEATURE_UNAVAILABLE'};
  }
  if (!limits.enabled || item.text.length > limits.max_input_characters) {
    const code = !limits.enabled ? "CHANNEL_DISABLED" : "INPUT_TOO_LARGE";
    await markInboundEvent(c, item, "failed", code);
    return { ok: false, code };
  }
  const requestId = `channel:${item.messageId}`;
  const existingUsage = await env.DB.prepare(
    "SELECT status FROM usage_events WHERE request_id = ? AND tenant_id = ?"
  ).bind(requestId, item.tenantId).first<{ status: string }>();
  if (existingUsage?.status === "completed") {
    await markInboundEvent(c, item, "completed");
    return { ok: true, duplicate: true };
  }
  if (existingUsage?.status === "failed") {
    await markInboundEvent(c, item, "failed", "PREVIOUS_ATTEMPT_FAILED");
    return { ok: false, code: "PREVIOUS_ATTEMPT_FAILED", duplicate: true };
  }

  const plan = await env.DB.prepare(
    `SELECT p.*, s.current_period_start FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = ?`
  ).bind(item.tenantId).first<any>();
  const resolved = await resolveProvider(c, installation.project_id, undefined, installation.chat_service_id);
  if (!resolved.apiKey) {
    await markInboundEvent(
      c,
      item,
      "failed",
      resolved.mode === "byok" ? "TENANT_PROVIDER_KEY_NOT_FOUND" : "NO_PROVIDER"
    );
    return { ok: false, code: "NO_PROVIDER" };
  }

  const model = resolved.provider === "openai" ? "gpt-5-mini" : MANAGED_GEMINI_MODEL;
  const history = await env.DB.prepare(
    `SELECT role, content FROM messages WHERE conversation_id = ?
     ORDER BY created_at DESC LIMIT 20`
  ).bind(item.conversationId).all<{ role: string; content: string }>();
  const providerInput = [...history.results].reverse().map((message) => ({
    role: message.role,
    content: message.content,
  }));
  providerInput.unshift({ role: "system", content: `Use at most ${limits.max_outputs} paragraphs or list items, and ${limits.max_output_characters} characters.` });
  const referenceContext = await retrieveKnowledgeContext(c,installation.project_id,installation.chat_service_id,item.text) +
    await businessContext(c,installation.project_id,installation.chat_service_id,item.text,requestId);
  if(referenceContext) providerInput.unshift({role:'system',content:referenceContext});
  const estimatedCredits = estimatedCreditChargeMicros(
    plan,
    resolved.mode,
    resolved.provider,
    model,
    providerInput
  );
  const creditReservation = await reserveCredits(
    c,
    item.tenantId,
    requestId,
    installation.project_id,
    estimatedCredits
  );
  if (!creditReservation.ok) {
    await markInboundEvent(c, item, "failed", creditReservation.code || "BILLING_ERROR");
    return { ok: false, code: creditReservation.code || "BILLING_ERROR" };
  }

  const usageReserved = existingUsage?.status === "reserved" || await reserveUsage(
    c,
    plan,
    requestId,
    installation.project_id,
    resolved.provider,
    model,
    resolved.mode,
    "auto",
    "auto"
  );
  if (!usageReserved) {
    await refundCreditReservation(c, item.tenantId, requestId);
    await markInboundEvent(c, item, "failed", "QUOTA_EXCEEDED");
    return { ok: false, code: "QUOTA_EXCEEDED" };
  }

  let result;
  try {
    result = resolved.provider === "openai"
      ? await callOpenAI(env, resolved.apiKey, model, providerInput, "auto", false, Math.min(limits.max_output_tokens, resolved.mode === "managed" ? MANAGED_MAX_OUTPUT_TOKENS : limits.max_output_tokens))
      : await callGemini(env, resolved.apiKey, model, providerInput, "auto", false, Math.min(limits.max_output_tokens, resolved.mode === "managed" ? MANAGED_MAX_OUTPUT_TOKENS : limits.max_output_tokens));
  } catch {
    await env.DB.prepare(
      "UPDATE usage_events SET status = 'failed' WHERE request_id = ? AND tenant_id = ? AND status = 'reserved'"
    ).bind(requestId, item.tenantId).run().catch(() => undefined);
    await refundCreditReservation(c, item.tenantId, requestId).catch(() => undefined);
    await markInboundEvent(c, item, "failed", "PROVIDER_ERROR").catch(() => undefined);
    return { ok: false, code: "PROVIDER_ERROR" };
  }

  result.text = limitReply(result.text, limits);
  const customerCharge = resolved.mode === "byok"
    ? Number(plan?.byok_request_fee_micros || 0)
    : managedCustomerChargeMicros(plan, resolved.provider, model, result.inputTokens, result.outputTokens);
  const timestamp = now();
  const deliveryId = `delivery_${item.messageId}`;
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO messages (id, conversation_id, role, content, input_tokens, output_tokens, created_at)
         VALUES (?, ?, 'assistant', ?, ?, ?, ?)`
      ).bind(id("msg"), item.conversationId, result.text, result.inputTokens, result.outputTokens, timestamp),
      env.DB.prepare(
        `UPDATE usage_events SET status = 'completed', input_tokens = ?, output_tokens = ?, total_tokens = ?,
         provider_cost_micros = ?, customer_charge_micros = ?
         WHERE request_id = ? AND tenant_id = ? AND status = 'reserved'`
      ).bind(result.inputTokens, result.outputTokens, result.inputTokens + result.outputTokens, result.providerCostMicros, customerCharge, requestId, item.tenantId),
      env.DB.prepare(
        `INSERT OR IGNORE INTO channel_deliveries
         (id, tenant_id, installation_id, conversation_id, channel, direction, status, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, 'outbound', 'queued', ?, ?)`
      ).bind(deliveryId, item.tenantId, item.installationId, item.conversationId, installation.channel,
        JSON.stringify({ external_conversation_id: installation.external_conversation_id, text: result.text }), timestamp),
      env.DB.prepare(
        "UPDATE conversations SET updated_at = ?, model = ? WHERE id = ? AND tenant_id = ?"
      ).bind(timestamp, model, item.conversationId, item.tenantId),
    ]);
  } catch {
    await env.DB.prepare(
      "UPDATE usage_events SET status = 'failed' WHERE request_id = ? AND tenant_id = ? AND status = 'reserved'"
    ).bind(requestId, item.tenantId).run().catch(() => undefined);
    await refundCreditReservation(c, item.tenantId, requestId).catch(() => undefined);
    await markInboundEvent(c, item, "failed", "PERSISTENCE_ERROR").catch(() => undefined);
    return { ok: false, code: "PERSISTENCE_ERROR" };
  }

  try {
    await completeCreditReservation(c, item.tenantId, requestId, customerCharge);
  } catch {
    await env.DB.prepare(
      "UPDATE channel_deliveries SET status = 'failed', last_error_code = 'SETTLEMENT_ERROR' WHERE id = ? AND tenant_id = ? AND status = 'queued'"
    ).bind(deliveryId, item.tenantId).run().catch(() => undefined);
    await markInboundEvent(c, item, "failed", "SETTLEMENT_ERROR").catch(() => undefined);
    return { ok: false, code: "SETTLEMENT_ERROR" };
  }
  await markInboundEvent(c, item, "completed");
  return { ok: true, deliveryId };
}

export async function getOwnedProject(
  c: AppContext,
  projectId: string,
  tenantId: string
): Promise<{ id: string; name: string; environment: string } | null> {
  return c.env.DB.prepare(
    `SELECT id, name, environment FROM projects WHERE id = ? AND tenant_id = ?`
  )
    .bind(projectId, tenantId)
    .first<{ id: string; name: string; environment: string }>();
}

export async function sendChannelDelivery(
  c: AppContext,
  deliveryId: string,
  maxAttempts = 3
): Promise<{
  ok: boolean;
  code?: string;
  retryable?: boolean;
  attempt?: number;
  externalMessageId?: string;
}> {
  const delivery = await c.env.DB.prepare(
    `SELECT d.id, d.tenant_id, d.installation_id, d.conversation_id, d.channel, d.payload_json,
            i.encrypted_credentials, i.status AS installation_status
     FROM channel_deliveries d JOIN channel_installations i ON i.id = d.installation_id
     WHERE d.id = ? AND d.status IN ('queued', 'retrying')`
  )
    .bind(deliveryId)
    .first<{
      id: string;
      tenant_id: string;
      installation_id: string;
      conversation_id: string;
      channel: Channel;
      payload_json: string;
      encrypted_credentials: string;
      installation_status: string;
    }>();
  if (!delivery || delivery.installation_status !== "active") {
    return { ok: false, code: "CHANNEL_DISABLED" };
  }
  const started=await c.env.DB.prepare('SELECT created_at FROM conversations WHERE id=? AND tenant_id=?').bind(delivery.conversation_id,delivery.tenant_id).first<{created_at:number}>();
  if(!await featureAllowed(c.env.DB,'channel.'+delivery.channel,delivery.tenant_id,started?.created_at)){
    await c.env.DB.prepare("UPDATE channel_deliveries SET status='failed',last_error_code='FEATURE_UNAVAILABLE' WHERE id=? AND tenant_id=?").bind(delivery.id,delivery.tenant_id).run();
    return {ok:false,code:'FEATURE_UNAVAILABLE',retryable:false};
  }
  const attempt = await c.env.DB.prepare(
    "SELECT attempt_count FROM channel_deliveries WHERE id = ? AND tenant_id = ?"
  )
    .bind(deliveryId, delivery.tenant_id)
    .first<{ attempt_count: number }>();
  const attemptCount = Number(attempt?.attempt_count || 0) + 1;
  await c.env.DB.prepare(
    "UPDATE channel_deliveries SET status = 'sending', attempt_count = ? WHERE id = ? AND tenant_id = ? AND status IN ('queued', 'retrying')"
  )
    .bind(attemptCount, deliveryId, delivery.tenant_id)
    .run();
  try {
    const credentials = JSON.parse(
      await decryptText(delivery.encrypted_credentials, c.env.MASTER_KEY)
    ) as Record<string, string>;
    const adapter = channelAdapters.get(delivery.channel);
    if (!adapter) throw new Error("CHANNEL_ADAPTER_NOT_FOUND");
    const payload = JSON.parse(delivery.payload_json) as {
      external_conversation_id: string;
      text: string;
    };
    const sent = await adapter.sendMessage(payload, credentials);
    await c.env.DB.prepare(
      "UPDATE channel_deliveries SET status = 'sent', external_message_id = ?, sent_at = ? WHERE id = ? AND tenant_id = ?"
    )
      .bind(sent.external_message_id, now(), deliveryId, delivery.tenant_id)
      .run();
    return { ok: true, externalMessageId: sent.external_message_id };
  } catch (error) {
    const code = String(error instanceof Error ? error.message : error).slice(
      0,
      100
    );
    const retryable =
      code === "CHANNEL_RATE_LIMITED" || code === "CHANNEL_TEMPORARY_FAILURE";
    const status =
      retryable && attemptCount < maxAttempts ? "retrying" : "failed";
    await c.env.DB.prepare(
      "UPDATE channel_deliveries SET status = ?, last_error_code = ? WHERE id = ? AND tenant_id = ?"
    )
      .bind(status, code, deliveryId, delivery.tenant_id)
      .run();
    return { ok: false, code, retryable, attempt: attemptCount };
  }
}
