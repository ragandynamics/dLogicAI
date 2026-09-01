import type { Context } from "hono";

export type Env = {
  DB: D1Database;
  DATA_BUCKET: R2Bucket;
  CHANNEL_QUEUE?: Queue;
  SESSION_SECRET: string;
  MASTER_KEY: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  MANAGED_SECONDARY_PROVIDER_PRIMARY?: string;
  STREAMING_ENABLED?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  APP_BASE_URL?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_ENABLED?: string;
  STRIPE_SECRET_KEY?: string;
  CORS_ORIGINS?: string;
  APP_ORIGINS?: string;
};

export type AuthContext = {
  userId: string;
  tenantId: string;
  role: string;
};

export type ProviderResult = {
  provider: string;
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  providerCostMicros: number;
  stream?: ReadableStream<Uint8Array>;
};

export type ChannelQueueMessage = {
  type: "channel.inbound" | "channel.outbound";
  tenantId: string;
  installationId: string;
  conversationId?: string;
  messageId?: string;
  text: string;
  deliveryId?: string;
  attempt?: number;
};

export type HonoVariables = {
  auth?: AuthContext;
  apiProjectId?: string;
  apiKey?: string;
};

export type AppContext = Context<{ Bindings: Env; Variables: HonoVariables }>;

export type CreditAccount = {
  id: string;
  tenant_id: string;
  subscription_balance: number;
  purchased_balance: number;
  promotional_balance: number;
  total_consumed: number;
  auto_topup_enabled: number;
  auto_topup_threshold: number;
  auto_topup_credits: number;
  auto_topup_limit: number;
};
