import { auditMutation } from "../services/audit";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Env, HonoVariables } from "../types";
import { id, now, jsonError } from "../utils/common";
import { encryptText, decryptText, sha256 } from "../utils/crypto";
import { setupScope, takeRate } from "../services/channel-setup";
import { managedBotLink, telegramCall } from "../integrations/telegram-management";

const router = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
const scope = "/v1/projects/:projectId/chat-services/:serviceId/telegram-connect";
type Pending = { id: string; tenant_id: string; project_id: string; chat_service_id: string; user_id: string; status: string; telegram_user_id: string; telegram_name: string; bot_id: string; installation_id: string; expires_at: number };
export function telegramReady(env: Env) {
  return !!(env.TELEGRAM_MANAGER_BOT_TOKEN && /^[A-Za-z0-9_]+$/.test(env.TELEGRAM_MANAGER_USERNAME || "") && env.TELEGRAM_MANAGER_WEBHOOK_SECRET && /^https:\/\//.test(env.APP_BASE_URL || ""));
}
router.use("/v1/webhooks/telegram-manager", bodyLimit({ maxSize: 65536, onError: (c) => jsonError(c, "INPUT_TOO_LARGE", "Request is too large.", 413) }));
router.get(scope, async (c) => {
  const access = await setupScope(c); if (access.error) return access.error;
  return c.json({ available: telegramReady(c.env) });
});
router.post(scope, async (c) => {
  const access = await setupScope(c); if (access.error) return access.error;
  if (!telegramReady(c.env)) return jsonError(c, "TELEGRAM_SETUP_REQUIRED", "Telegram Connect needs platform setup. You can still connect an existing bot with its token.", 503);
  if (!await takeRate(c, `telegram:${access.auth.userId}`, 5)) return jsonError(c, "RATE_LIMIT", "Please wait before starting again.", 429);
  const token = crypto.randomUUID().replaceAll("-", ""); const pendingId = id("tg");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE telegram_onboarding SET status = 'expired' WHERE expires_at < ? AND status != 'completed'").bind(now()),
    c.env.DB.prepare("UPDATE telegram_onboarding SET status = 'cancelled' WHERE user_id = ? AND tenant_id = ? AND status IN ('pending','linked','ready')").bind(access.auth.userId, access.auth.tenantId),
    c.env.DB.prepare(`INSERT INTO telegram_onboarding (id, tenant_id, project_id, chat_service_id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(pendingId, access.auth.tenantId, c.req.param("projectId"), c.req.param("serviceId"), access.auth.userId, await sha256(token), now() + 900000, now()),
  ]);
  return c.json({ id: pendingId, url: `https://t.me/${c.env.TELEGRAM_MANAGER_USERNAME}?start=${token}`, expires_in: 900 });
});
router.get(`${scope}/:pendingId`, async (c) => {
  const access = await setupScope(c); if (access.error) return access.error;
  const pending = await c.env.DB.prepare("SELECT * FROM telegram_onboarding WHERE id = ? AND tenant_id = ? AND project_id = ? AND chat_service_id = ? AND user_id = ?")
    .bind(c.req.param("pendingId"), access.auth.tenantId, c.req.param("projectId"), c.req.param("serviceId"), access.auth.userId).first<Pending>();
  if (!pending) return jsonError(c, "NOT_FOUND", "Connection not found.", 404);
  return c.json({ status: pending.expires_at < now() && pending.status !== "completed" ? "expired" : pending.status,
    telegram_name: pending.telegram_name, telegram_user_id: pending.telegram_user_id,
    installation_id: pending.installation_id,
    create_url: pending.status === "ready" && pending.expires_at > now() ? managedBotLink(c.env.TELEGRAM_MANAGER_USERNAME!) : null });
});
router.post(`${scope}/:pendingId/confirm`, async (c) => {
  const access = await setupScope(c); if (access.error) return access.error;
  const result = await c.env.DB.prepare(`UPDATE telegram_onboarding SET status = 'ready' WHERE id = ? AND tenant_id = ? AND project_id = ?
    AND chat_service_id = ? AND user_id = ? AND status = 'linked' AND expires_at > ?`)
    .bind(c.req.param("pendingId"), access.auth.tenantId, c.req.param("projectId"), c.req.param("serviceId"), access.auth.userId, now()).run();
  if (!result.meta.changes) return jsonError(c, "CONNECTION_NOT_READY", "Link your Telegram account first, or start again if this connection expired.", 409);
  return c.json({ create_url: managedBotLink(c.env.TELEGRAM_MANAGER_USERNAME!) });
});

router.post("/v1/webhooks/telegram-manager", async (c) => {
  const secret = c.req.header("X-Telegram-Bot-Api-Secret-Token");
  if (!telegramReady(c.env) || !secret || await sha256(secret) !== await sha256(c.env.TELEGRAM_MANAGER_WEBHOOK_SECRET!)) return jsonError(c, "INVALID_SIGNATURE", "Invalid webhook.", 401);
  const update = await c.req.json().catch(() => null) as any;
  if (!update || !Number.isSafeInteger(update.update_id)) return jsonError(c, "INVALID_REQUEST", "Invalid update.");
  const message = update.message;
  const start = typeof message?.text === "string" ? /^\/start ([a-f0-9]{32})$/.exec(message.text) : null;
  if (start && message.chat?.type === "private" && Number.isSafeInteger(message.from?.id) && !message.from.is_bot) {
    try {
      await c.env.DB.prepare(`UPDATE telegram_onboarding SET telegram_user_id = ?, telegram_name = ?, status = 'linked'
        WHERE token_hash = ? AND status = 'pending' AND expires_at > ?`)
        .bind(String(message.from.id), String(message.from.username || message.from.first_name || "Telegram user").slice(0, 100), await sha256(start[1]), now()).run();
    } catch { return jsonError(c, "IDENTITY_BUSY", "Finish the existing connection or wait for it to expire.", 409); }
    return c.json({ received: true });
  }
  const managed = update.managed_bot;
  if (!Number.isSafeInteger(managed?.user?.id) || !Number.isSafeInteger(managed?.bot?.id) || !managed.bot.is_bot) return c.json({ received: true });
  const botId = String(managed.bot.id);
  // Updates for previously attached bots must not bind them to a new tenant.
  const existing = await c.env.DB.prepare("SELECT id FROM channel_installations WHERE channel = 'telegram' AND external_account_id = ?").bind(botId).first();
  if (existing) {
    const owner = await c.env.DB.prepare("SELECT telegram_user_id FROM telegram_onboarding WHERE installation_id = ? AND status = 'completed'")
      .bind((existing as any).id).first<{ telegram_user_id: string }>();
    if (owner && owner.telegram_user_id !== String(managed.user.id)) {
      await c.env.DB.prepare("UPDATE channel_installations SET status = 'inactive', updated_at = ? WHERE id = ?")
        .bind(now(), (existing as any).id).run();
      return c.json({ received: true });
    }
  }
  const pending = await c.env.DB.prepare(`SELECT * FROM telegram_onboarding WHERE telegram_user_id = ? AND status IN ('ready','processing') AND expires_at > ?`)
    .bind(String(managed.user.id), now()).first<Pending>();
  if (!pending || (pending.bot_id && pending.bot_id !== botId)) return c.json({ received: true });
  const installId = `install_${pending.id}`;
  if (existing && (existing as any).id !== installId) return c.json({ received: true });
  const claimed = await c.env.DB.prepare("UPDATE telegram_onboarding SET status = 'processing', bot_id = ? WHERE id = ? AND (status = 'ready' OR (status = 'processing' AND bot_id = ?))")
    .bind(botId, pending.id, botId).run();
  if (!claimed.meta.changes) return c.json({ received: true });
  try {
    const token = await telegramCall<string>(c.env.TELEGRAM_MANAGER_BOT_TOKEN!, "getManagedBotToken", { user_id: managed.bot.id });
    const bot = await telegramCall<{ id: number }>(token, "getMe");
    if (String(bot.id) !== botId) throw new Error("Bot mismatch");
    // Stable stored secret means retries register exactly the same webhook.
    const credentials = { bot_token: token, webhook_secret: crypto.randomUUID().replaceAll("-", "") };
    await auditMutation(c, { tenantId: pending.tenant_id, userId: pending.user_id }, "channel.created", "channel_installation", installId, c.env.DB.prepare(`INSERT INTO channel_installations (id, tenant_id, project_id, chat_service_id, channel, external_account_id,
      encrypted_credentials, webhook_secret_hash, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'telegram', ?, ?, ?, 'testing', ?, ?)
      ON CONFLICT(id) DO NOTHING`)
      .bind(installId, pending.tenant_id, pending.project_id, pending.chat_service_id, botId, await encryptText(JSON.stringify(credentials), c.env.MASTER_KEY), await sha256(credentials.webhook_secret), now(), now()));
    const stored = await c.env.DB.prepare("SELECT encrypted_credentials FROM channel_installations WHERE id = ? AND tenant_id = ?").bind(installId, pending.tenant_id).first<{ encrypted_credentials: string }>();
    const saved = JSON.parse(await decryptText(stored!.encrypted_credentials, c.env.MASTER_KEY));
    const callback = new URL(`/api/v1/webhooks/channels/telegram/${installId}`, c.env.APP_BASE_URL).href;
    await telegramCall(saved.bot_token, "setWebhook", { url: callback, secret_token: saved.webhook_secret, allowed_updates: ["message"] });
    await c.env.DB.prepare("UPDATE telegram_onboarding SET status = 'completed', installation_id = ? WHERE id = ? AND bot_id = ?")
      .bind(installId, pending.id, botId).run();
    return c.json({ received: true });
  } catch { return jsonError(c, "TELEGRAM_RETRY", "Telegram setup could not complete. The webhook can be retried.", 503); }
});
export const telegramConnectRoutes = router;
