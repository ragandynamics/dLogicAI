export type Channel = "telegram" | "whatsapp";

export type ChannelInstallation = {
  id: string;
  tenant_id: string;
  project_id: string;
  chat_service_id: string;
  channel: Channel;
  external_account_id: string;
  encrypted_credentials: string;
  webhook_secret_hash: string | null;
  status: string;
};

export type NormalizedInboundMessage = {
  channel: Channel;
  external_message_id: string;
  external_conversation_id: string;
  external_sender_id: string;
  sender_name: string | null;
  text: string | null;
  received_at: number;
  metadata: Record<string, unknown>;
};

export type ChannelAdapter = {
  channel: Channel;
  verifyWebhook(request: Request, installation: ChannelInstallation, rawBody: string, credentials?: Record<string, string>): Promise<boolean>;
  parseInbound(rawBody: string): NormalizedInboundMessage[];
  sendMessage(message: { external_conversation_id: string; text: string }, credentials: Record<string, string>): Promise<{ external_message_id: string }>;
};
