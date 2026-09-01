import type { AppContext } from "../types";
import { channelAdapters } from "../integrations/channel-adapters";
import type { Channel } from "../integrations/channel-types";
import { decryptText } from "../utils/crypto";
import { now } from "../utils/common";

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
