import type { ChannelAdapter, ChannelInstallation, NormalizedInboundMessage } from "./channel-types";

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function hmacSha256(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseJson(rawBody: string): any {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

const telegramAdapter: ChannelAdapter = {
  channel: "telegram",
  async verifyWebhook(request, installation) {
    const supplied = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
    return Boolean(installation.webhook_secret_hash && supplied && constantTimeEqual(installation.webhook_secret_hash, await sha256(supplied)));
  },
  parseInbound(rawBody) {
    const update = parseJson(rawBody);
    const message = update?.message;
    if (!message?.chat?.id || !message?.message_id) return [];
    return [{
      channel: "telegram",
      external_message_id: String(update.update_id ?? message.message_id),
      external_conversation_id: String(message.chat.id),
      external_sender_id: String(message.from?.id ?? message.chat.id),
      sender_name: message.from?.first_name ? [message.from.first_name, message.from.last_name].filter(Boolean).join(" ") : null,
      text: typeof message.text === "string" ? message.text : null,
      received_at: Date.now(),
      metadata: { chat_type: message.chat.type || null, update_type: "message" },
    }];
  },
  async sendMessage(message, credentials) {
    if (!credentials.bot_token) throw new Error("CHANNEL_CREDENTIAL_MISSING");
    const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(credentials.bot_token)}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: message.external_conversation_id, text: message.text }),
    });
    if (!response.ok) throw new Error(response.status === 429 ? "CHANNEL_RATE_LIMITED" : "CHANNEL_MESSAGE_REJECTED");
    const data = await response.json<any>();
    if (!data.ok || !data.result?.message_id) throw new Error("CHANNEL_MESSAGE_REJECTED");
    return { external_message_id: String(data.result.message_id) };
  },
};

const whatsappAdapter: ChannelAdapter = {
  channel: "whatsapp",
  async verifyWebhook(request, installation, rawBody, credentials) {
    const signature = request.headers.get("X-Hub-Signature-256") || "";
    const supplied = signature.startsWith("sha256=") ? signature.slice(7) : "";
    const appSecret = credentials?.app_secret;
    if (!appSecret) return false;
    return constantTimeEqual(supplied, await hmacSha256(appSecret, rawBody));
  },
  parseInbound(rawBody) {
    const payload = parseJson(rawBody);
    const messages: NormalizedInboundMessage[] = [];
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        for (const message of change?.value?.messages || []) {
          messages.push({
            channel: "whatsapp",
            external_message_id: String(message.id || ""),
            external_conversation_id: String(message.from || ""),
            external_sender_id: String(message.from || ""),
            sender_name: null,
            text: message.type === "text" ? String(message.text?.body || "") : null,
            received_at: Date.now(),
            metadata: { phone_number_id: change.value?.metadata?.phone_number_id || null, message_type: message.type || null },
          });
        }
      }
    }
    return messages.filter((message) => message.external_message_id && message.external_conversation_id);
  },
  async sendMessage(message, credentials) {
    if (!credentials.access_token || !credentials.phone_number_id) throw new Error("CHANNEL_CREDENTIAL_MISSING");
    const response = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(credentials.phone_number_id)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: message.external_conversation_id, type: "text", text: { body: message.text } }),
    });
    if (!response.ok) throw new Error(response.status === 429 ? "CHANNEL_RATE_LIMITED" : "CHANNEL_MESSAGE_REJECTED");
    const data = await response.json<any>();
    if (!data.messages?.[0]?.id) throw new Error("CHANNEL_MESSAGE_REJECTED");
    return { external_message_id: String(data.messages[0].id) };
  },
};

export const channelAdapters = new Map<string, ChannelAdapter>([
  [telegramAdapter.channel, telegramAdapter],
  [whatsappAdapter.channel, whatsappAdapter],
]);
