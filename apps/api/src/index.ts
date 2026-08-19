import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

type Env = {
  DB: D1Database;
  SESSION_SECRET: string;
  MASTER_KEY: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;

  // Stripe Billing
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_SUCCESS_URL?: string;
  STRIPE_CANCEL_URL?: string;
};

type AuthContext = {
  userId: string;
  tenantId: string;
};

type ProviderResult = {
  provider: string;
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  providerCostMicros: number;
  stream?: ReadableStream<Uint8Array>;
};

type HonoVariables = {
  auth?: AuthContext;
  apiProjectId?: string;
  apiKey?: string;
};

const app = new Hono<{
  Bindings: Env;
  Variables: HonoVariables;
}>();

type CreditAccount = {
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

function totalAvailableCredits(account: CreditAccount) {
  return (
    account.subscription_balance +
    account.purchased_balance +
    account.promotional_balance
  );
}

async function getCreditAccount(
  c: any,
  tenantId: string
): Promise<CreditAccount | null> {
  return (await c.env.DB.prepare(
    `
    SELECT *
    FROM credit_accounts
    WHERE tenant_id = ?
    `
  )
    .bind(tenantId)
    .first()) as CreditAccount | null;
}

async function createCreditAccount(
  c: any,
  tenantId: string,
  initialCredits: number
) {
  const accountId = id("cred");
  const t = now();

  await c.env.DB.batch([
    c.env.DB.prepare(
      `
      INSERT INTO credit_accounts (
        id,
        tenant_id,
        subscription_balance,
        purchased_balance,
        promotional_balance,
        total_consumed,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 0, 0, 0, ?, ?)
      `
    ).bind(accountId, tenantId, initialCredits, t, t),

    c.env.DB.prepare(
      `
      INSERT INTO credit_ledger (
        id,
        tenant_id,
        credit_account_id,
        entry_type,
        source,
        amount,
        balance_after,
        reference_type,
        reference_id,
        description,
        created_at
      )
      VALUES (?, ?, ?, 'credit', 'subscription', ?, ?, 'subscription', ?, ?, ?)
      `
    ).bind(
      id("led"),
      tenantId,
      accountId,
      initialCredits,
      initialCredits,
      "initial_subscription",
      "Initial subscription AI credits",
      t
    ),
  ]);

  return accountId;
}

/* -------------------------------------------------------------------------- */
/* CORS                                                                       */
/* -------------------------------------------------------------------------- */

app.use(
  "*",
  cors({
    origin: (origin) => origin || "*",
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })
);

/* -------------------------------------------------------------------------- */
/* HEALTH                                                                     */
/* -------------------------------------------------------------------------- */

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "dlogicai-api",
    version: "0.1.0",
  })
);

/* -------------------------------------------------------------------------- */
/* GENERAL HELPERS                                                            */
/* -------------------------------------------------------------------------- */

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function now() {
  return Date.now();
}

function jsonError(
  c: any,
  code: string,
  message: string,
  status = 400
) {
  return c.json(
    {
      error: {
        code,
        message,
      },
    },
    status
  );
}


/* -------------------------------------------------------------------------- */
/* STRIPE HELPERS                                                             */
/* -------------------------------------------------------------------------- */

function requireStripe(env: Env) {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured.");
  }
  return env.STRIPE_SECRET_KEY;
}

function formEncode(values: Record<string, string | number | boolean | null | undefined>) {
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    body.set(key, String(value));
  }

  return body;
}

async function stripeRequest(
  env: Env,
  path: string,
  method: "GET" | "POST" = "GET",
  params?: Record<string, string | number | boolean | null | undefined>
) {
  const secret = requireStripe(env);

  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(method === "POST"
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body:
      method === "POST" && params
        ? formEncode(params)
        : undefined,
  });

  const text = await response.text();

  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Stripe API request failed with status ${response.status}.`;

    throw new Error(message);
  }

  return data;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;

  let diff = 0;

  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }

  return diff === 0;
}

function hexToBytesStrict(hex: string) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Invalid hex.");
  }

  const out = new Uint8Array(hex.length / 2);

  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return out;
}

async function verifyStripeSignature(
  payload: string,
  signatureHeader: string | undefined,
  webhookSecret: string | undefined
) {
  if (!signatureHeader || !webhookSecret) return false;

  const timestampPart = signatureHeader
    .split(",")
    .find((part) => part.startsWith("t="));

  if (!timestampPart) return false;

  const timestamp = Number(timestampPart.slice(2));

  if (!Number.isInteger(timestamp)) return false;

  // Stripe recommends a five-minute replay tolerance.
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) {
    return false;
  }

  const expectedSignatures = signatureHeader
    .split(",")
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .filter((value) => /^[0-9a-f]{64}$/i.test(value));

  if (expectedSignatures.length === 0) return false;

  const signedPayload = `${timestamp}.${payload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const digest = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(signedPayload)
    )
  );

  return expectedSignatures.some((candidate) =>
    constantTimeEqual(
      digest,
      hexToBytesStrict(candidate)
    )
  );
}

function stripeUnixMs(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0
    ? Math.floor(n * 1000)
    : fallback;
}

function stripeCustomerId(value: any) {
  return typeof value === "string"
    ? value
    : value?.id || null;
}

function stripeSubscriptionId(value: any) {
  return typeof value === "string"
    ? value
    : value?.id || null;
}

async function getPlanByStripePrice(
  c: any,
  priceId: string
) {
  return c.env.DB.prepare(
    `
    SELECT *
    FROM plans
    WHERE stripe_price_id = ?
    LIMIT 1
    `
  )
    .bind(priceId)
    .first<any>();
}

async function getPlanForSubscription(
  c: any,
  stripeSubscription: any
) {
  const priceId =
    stripeSubscription?.items?.data?.[0]?.price?.id;

  if (!priceId) return null;

  return getPlanByStripePrice(c, priceId);
}

async function creditSubscriptionPeriod(
  c: any,
  tenantId: string,
  plan: any,
  referenceId: string
) {
  const credits = Math.max(
    Number(plan?.included_requests || 0),
    0
  );

  if (credits <= 0) return;

  const account = await getCreditAccount(
    c,
    tenantId
  );

  if (!account) {
    await createCreditAccount(
      c,
      tenantId,
      credits
    );
    return;
  }

  const t = now();

  // Subscription credits are a monthly entitlement.
  // Reset only this balance; purchased/promotional credits remain intact.
  await c.env.DB.batch([
    c.env.DB.prepare(
      `
      UPDATE credit_accounts
      SET
        subscription_balance = ?,
        updated_at = ?
      WHERE tenant_id = ?
      `
    ).bind(
      credits,
      t,
      tenantId
    ),

    c.env.DB.prepare(
      `
      INSERT INTO credit_ledger (
        id,
        tenant_id,
        credit_account_id,
        entry_type,
        source,
        amount,
        balance_after,
        reference_type,
        reference_id,
        description,
        created_at
      )
      VALUES (?, ?, ?, 'credit', 'subscription', ?, ?, 'invoice', ?, ?, ?)
      `
    ).bind(
      id("led"),
      tenantId,
      account.id,
      credits,
      credits,
      referenceId,
      `Stripe subscription period credits: ${plan.name}`,
      t
    ),
  ]);
}

async function syncStripeSubscription(
  c: any,
  stripeSubscription: any
) {
  const stripeSubId =
    stripeSubscriptionId(
      stripeSubscription
    );

  if (!stripeSubId) {
    throw new Error(
      "Stripe subscription has no id."
    );
  }

  const customerId =
    stripeCustomerId(
      stripeSubscription.customer
    );

  const plan =
    await getPlanForSubscription(
      c,
      stripeSubscription
    );

  const metadata =
    stripeSubscription.metadata || {};

  let internal =
    metadata.internal_subscription_id
      ? await c.env.DB.prepare(
          `
          SELECT *
          FROM subscriptions
          WHERE id = ?
          LIMIT 1
          `
        )
          .bind(
            metadata.internal_subscription_id
          )
          .first<any>()
      : null;

  if (!internal && customerId) {
    internal =
      await c.env.DB.prepare(
        `
        SELECT *
        FROM subscriptions
        WHERE external_customer_id = ?
        ORDER BY created_at DESC
        LIMIT 1
        `
      )
        .bind(customerId)
        .first<any>();
  }

  if (!internal) {
    return {
      matched: false,
      plan,
      subscriptionId: stripeSubId,
    };
  }

  const currentPlanId =
    plan?.id || internal.plan_id;

  const status =
    typeof stripeSubscription.status === "string"
      ? stripeSubscription.status
      : internal.status;

  const periodStart =
    stripeUnixMs(
      stripeSubscription.current_period_start,
      internal.current_period_start || now()
    );

  const periodEnd =
    stripeUnixMs(
      stripeSubscription.current_period_end,
      internal.current_period_end || now()
    );

  await c.env.DB.prepare(
    `
    UPDATE subscriptions
    SET
      plan_id = ?,
      status = ?,
      current_period_start = ?,
      current_period_end = ?,
      external_customer_id = ?,
      external_subscription_id = ?,
      updated_at = ?
    WHERE id = ?
    `
  )
    .bind(
      currentPlanId,
      status,
      periodStart,
      periodEnd,
      customerId,
      stripeSubId,
      now(),
      internal.id
    )
    .run();

  return {
    matched: true,
    internal,
    plan,
    subscriptionId: stripeSubId,
    status,
  };
}

async function handleStripeEvent(
  c: any,
  event: any
) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;

      const tenantId =
        session.metadata?.tenant_id ||
        session.client_reference_id;

      const planId =
        session.metadata?.plan_id;

      const internalSubscriptionId =
        session.metadata?.internal_subscription_id;

      const customerId =
        stripeCustomerId(session.customer);

      const stripeSubId =
        stripeSubscriptionId(
          session.subscription
        );

      if (
        !tenantId ||
        !planId ||
        !internalSubscriptionId
      ) {
        throw new Error(
          "Checkout session is missing required dLogicAI metadata."
        );
      }

      await c.env.DB.prepare(
        `
        UPDATE subscriptions
        SET
          plan_id = ?,
          external_customer_id = ?,
          external_subscription_id = ?,
          updated_at = ?
        WHERE id = ?
          AND tenant_id = ?
        `
      )
        .bind(
          planId,
          customerId,
          stripeSubId,
          now(),
          internalSubscriptionId,
          tenantId
        )
        .run();

      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription =
        event.data.object;

      const synced =
        await syncStripeSubscription(
          c,
          subscription
        );

      // A deleted subscription must never retain access.
      if (
        event.type ===
        "customer.subscription.deleted" &&
        synced.matched
      ) {
        await c.env.DB.prepare(
          `
          UPDATE subscriptions
          SET status = 'canceled', updated_at = ?
          WHERE external_subscription_id = ?
          `
        )
          .bind(
            now(),
            stripeSubscriptionId(
              subscription
            )
          )
          .run();
      }

      return;
    }

    case "invoice.paid": {
      const invoice =
        event.data.object;

      const stripeSubId =
        stripeSubscriptionId(
          invoice.subscription
        );

      if (!stripeSubId) return;

      // Stripe does not guarantee webhook ordering, so retrieve
      // the subscription instead of assuming subscription.created arrived first.
      const stripeSubscription =
        await stripeRequest(
          c.env,
          `/subscriptions/${encodeURIComponent(
            stripeSubId
          )}`,
          "GET"
        );

      const synced =
        await syncStripeSubscription(
          c,
          stripeSubscription
        );

      if (
        synced.matched &&
        synced.plan
      ) {
        await creditSubscriptionPeriod(
          c,
          synced.internal.tenant_id,
          synced.plan,
          invoice.id
        );
      }

      return;
    }

    case "invoice.payment_failed": {
      const invoice =
        event.data.object;

      const stripeSubId =
        stripeSubscriptionId(
          invoice.subscription
        );

      if (!stripeSubId) return;

      await c.env.DB.prepare(
        `
        UPDATE subscriptions
        SET status = 'past_due', updated_at = ?
        WHERE external_subscription_id = ?
        `
      )
        .bind(
          now(),
          stripeSubId
        )
        .run();

      return;
    }

    default:
      // Ignore unrelated Stripe events.
      return;
  }
}

/**
 * Local development:
 *   http://127.0.0.1:8787 -> do NOT use Secure
 *
 * Production:
 *   https://... -> Secure
 */
function sessionCookie(
  c: any,
  sessionId: string,
  maxAge: number
) {
  const protocol = new URL(c.req.url).protocol;
  const secure = protocol === "https:";

  return [
    `dlogicai_session=${encodeURIComponent(sessionId)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

function parseCookies(header: string | undefined) {
  const out: Record<string, string> = {};

  if (!header) {
    return out;
  }

  for (const part of header.split(";")) {
    const i = part.indexOf("=");

    if (i > 0) {
      const name = part.slice(0, i).trim();
      const value = part.slice(i + 1).trim();

      try {
        out[name] = decodeURIComponent(value);
      } catch {
        out[name] = value;
      }
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* CRYPTO HELPERS                                                             */
/* -------------------------------------------------------------------------- */

function bytesToHex(bytes: Uint8Array) {
  return [...bytes]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string) {
  if (!hex || hex.length % 2 !== 0) {
    throw new Error("Invalid hexadecimal value.");
  }

  const out = new Uint8Array(hex.length / 2);

  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(
      hex.slice(i * 2, i * 2 + 2),
      16
    );

    if (Number.isNaN(byte)) {
      throw new Error("Invalid hexadecimal value.");
    }

    out[i] = byte;
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* PASSWORD HASHING                                                           */
/* -------------------------------------------------------------------------- */

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(
    new Uint8Array(16)
  );

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const iterations = 150000;
  

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    key,
    256
  );

  return `pbkdf2$${iterations}$${bytesToHex(
    salt
  )}$${bytesToHex(new Uint8Array(bits))}`;
}

async function verifyPassword(
  password: string,
  stored: string
) {
  try {
    const parts = stored.split("$");

    if (parts.length !== 4) {
      return false;
    }

    const [
      algorithm,
      iterationsString,
      saltHex,
      hashHex,
    ] = parts;

    if (algorithm !== "pbkdf2") {
      return false;
    }

    const iterations = Number(iterationsString);

    if (
      !Number.isInteger(iterations) ||
      iterations <= 0
    ) {
      return false;
    }

    const salt = hexToBytes(saltHex);

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256",
      },
      key,
      256
    );

    const actual = new Uint8Array(bits);
    const expected = hexToBytes(hashHex);

    if (actual.length !== expected.length) {
      return false;
    }

    let diff = 0;

    for (let i = 0; i < actual.length; i++) {
      diff |= actual[i] ^ expected[i];
    }

    return diff === 0;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* HASHING                                                                    */
/* -------------------------------------------------------------------------- */

async function sha256(value: string) {
  return bytesToHex(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value)
      )
    )
  );
}

/* -------------------------------------------------------------------------- */
/* ENCRYPTION FOR BYOK CREDENTIALS                                            */
/* -------------------------------------------------------------------------- */

async function encryptText(
  plaintext: string,
  masterHex: string
) {
  const keyBytes = hexToBytes(masterHex);

  if (keyBytes.length !== 32) {
    throw new Error(
      "MASTER_KEY must be exactly 32 bytes hex."
    );
  }

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(
    new Uint8Array(12)
  );

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    new TextEncoder().encode(plaintext)
  );

  return `${bytesToHex(iv)}.${bytesToHex(
    new Uint8Array(ciphertext)
  )}`;
}

async function decryptText(
  payload: string,
  masterHex: string
) {
  const parts = payload.split(".");

  if (parts.length !== 2) {
    throw new Error(
      "Invalid encrypted credential payload."
    );
  }

  const [ivHex, dataHex] = parts;

  const keyBytes = hexToBytes(masterHex);

  if (keyBytes.length !== 32) {
    throw new Error(
      "MASTER_KEY must be exactly 32 bytes hex."
    );
  }

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: hexToBytes(ivHex),
    },
    key,
    hexToBytes(dataHex)
  );

  return new TextDecoder().decode(plaintext);
}

/* -------------------------------------------------------------------------- */
/* AUTHENTICATION HELPERS                                                     */
/* -------------------------------------------------------------------------- */

function bearer(request: Request) {
  const header =
    request.headers.get("Authorization") || "";

  if (!header.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice(7).trim();

  return token || null;
}

async function sessionAuth(
  c: any
): Promise<AuthContext | null> {
  const cookies = parseCookies(
    c.req.header("Cookie")
  );

  const sessionId =
    cookies["dlogicai_session"];

  if (!sessionId) {
    return null;
  }

  const row = await c.env.DB.prepare(
    `
    SELECT
      s.user_id,
      m.tenant_id
    FROM sessions s
    JOIN memberships m
      ON m.user_id = s.user_id
    WHERE s.id = ?
      AND s.expires_at > ?
    ORDER BY m.created_at ASC
    LIMIT 1
    `
  )
    .bind(sessionId, now())
    .first<{
      user_id: string;
      tenant_id: string;
    }>();

  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    tenantId: row.tenant_id,
  };
}

async function apiKeyAuth(
  c: any
): Promise<AuthContext | null> {
  const raw = bearer(c.req.raw);

  if (!raw || !raw.startsWith("sk_")) {
    return null;
  }

  const hash = await sha256(raw);

  const row = await c.env.DB.prepare(
    `
    SELECT
      tenant_id,
      project_id
    FROM api_keys
    WHERE key_hash = ?
      AND status = 'active'
    LIMIT 1
    `
  )
    .bind(hash)
    .first<{
      tenant_id: string;
      project_id: string;
    }>();

  if (!row) {
    return null;
  }

  if (!row.tenant_id || !row.project_id) {
    console.error(
      "API key missing tenant/project"
    );

    return null;
  }

  c.set(
    "apiProjectId",
    row.project_id
  );

  c.set("apiKey", raw);

  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      `
      UPDATE api_keys
      SET last_used_at = ?
      WHERE key_hash = ?
      `
    )
      .bind(now(), hash)
      .run()
  );

  return {
    userId: "api",
    tenantId: row.tenant_id,
  };
}

async function requireDashboard(
  c: any
): Promise<AuthContext | null> {
  const auth = await sessionAuth(c);

  if (!auth) {
    return null;
  }

  c.set("auth", auth);

  return auth;
}

async function requireApi(
  c: any
): Promise<AuthContext | null> {
  const auth = await apiKeyAuth(c);

  if (!auth) {
    return null;
  }

  c.set("auth", auth);

  return auth;
}

/* -------------------------------------------------------------------------- */
/* TEXT / LANGUAGE HELPERS                                                    */
/* -------------------------------------------------------------------------- */

function extractText(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }

  if (Array.isArray(input)) {
    return input
      .map((message: any) => {
        if (
          typeof message?.content ===
          "string"
        ) {
          return message.content;
        }

        if (
          Array.isArray(message?.content)
        ) {
          return message.content
            .map(
              (item: any) =>
                item?.text || ""
            )
            .join("");
        }

        return "";
      })
      .join("\n");
  }

  if (
    input &&
    typeof input === "object"
  ) {
    return JSON.stringify(input);
  }

  return "";
}

async function detectLanguage(
  text: string
): Promise<string> {
  if (/[\u0B80-\u0BFF]/.test(text)) {
    return "ta";
  }

  if (/[\u0900-\u097F]/.test(text)) {
    return "hi";
  }

  if (/[\u4E00-\u9FFF]/.test(text)) {
    return "zh";
  }

  if (/[\u3040-\u30FF]/.test(text)) {
    return "ja";
  }

  if (/[\uAC00-\uD7AF]/.test(text)) {
    return "ko";
  }

  if (/[\u0600-\u06FF]/.test(text)) {
    return "ar";
  }

  if (/[\u0400-\u04FF]/.test(text)) {
    return "ru";
  }

  if (
    /\b(el|la|los|las|que|cómo|como|por|para|una|un)\b/i.test(
      text
    )
  ) {
    return "es";
  }

  if (
    /\b(le|les|des|une|comment|pour|avec)\b/i.test(
      text
    )
  ) {
    return "fr";
  }

  return "en";
}

/* -------------------------------------------------------------------------- */
/* PROVIDER PRICING                                                           */
/* -------------------------------------------------------------------------- */

async function reserveCredits(
  c: any,
  tenantId: string,
  requestId: string,
  projectId: string,
  requestedCredits: number
) {
  if (requestedCredits <= 0) {
    requestedCredits = 1;
  }

  const account = await getCreditAccount(c, tenantId);

  if (!account) {
    return {
      ok: false,
      code: "NO_CREDIT_ACCOUNT",
    };
  }

  const available = totalAvailableCredits(account);

  if (available < requestedCredits) {
    return {
      ok: false,
      code: "INSUFFICIENT_AI_CREDITS",
      available,
      required: requestedCredits,
    };
  }

  /*
   * Consume promotional credits first,
   * then subscription credits,
   * then purchased credits.
   */

  let remaining = requestedCredits;

  const promotionalUsed = Math.min(
    account.promotional_balance,
    remaining
  );

  remaining -= promotionalUsed;

  const subscriptionUsed = Math.min(
    account.subscription_balance,
    remaining
  );

  remaining -= subscriptionUsed;

  const purchasedUsed = Math.min(
    account.purchased_balance,
    remaining
  );

  const newPromotional =
    account.promotional_balance - promotionalUsed;

  const newSubscription =
    account.subscription_balance - subscriptionUsed;

  const newPurchased =
    account.purchased_balance - purchasedUsed;

  const t = now();

  await c.env.DB.batch([
    c.env.DB.prepare(
      `
      UPDATE credit_accounts
      SET
        promotional_balance = ?,
        subscription_balance = ?,
        purchased_balance = ?,
        total_consumed = total_consumed + ?,
        updated_at = ?
      WHERE tenant_id = ?
      `
    ).bind(
      newPromotional,
      newSubscription,
      newPurchased,
      requestedCredits,
      t,
      tenantId
    ),

    c.env.DB.prepare(
      `
      INSERT INTO credit_reservations (
        id,
        tenant_id,
        credit_account_id,
        request_id,
        project_id,
        reserved_credits,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'reserved', ?)
      `
    ).bind(
      id("cres"),
      tenantId,
      account.id,
      requestId,
      projectId,
      requestedCredits,
      t
    ),
  ]);

  return {
    ok: true,
    reserved: requestedCredits,
  };
}

function modelPricing(
  provider: string,
  model: string
) {
  /*
   * Approximate internal cost sheet.
   *
   * These values are NOT provider billing data.
   * They are internal values used for dLogicAI
   * usage accounting.
   *
   * USD per 1M tokens.
   */

  if (provider === "openai") {
    if (model.includes("gpt-5-mini")) {
      return {
        input: 0.25,
        output: 2.0,
      };
    }

    return {
      input: 1.0,
      output: 4.0,
    };
  }

  if (provider === "google") {
    if (model.includes("flash-lite")) {
      return {
        input: 0.10,
        output: 0.40,
      };
    }

    return {
      input: 0.30,
      output: 2.50,
    };
  }

  return {
    input: 0,
    output: 0,
  };
}

function costMicros(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
) {
  const pricing =
    modelPricing(provider, model);

  return Math.round(
    (
      inputTokens * pricing.input +
      outputTokens * pricing.output
    ) /
      1_000_000 *
      1_000_000
  );
}

/* -------------------------------------------------------------------------- */
/* USAGE RESERVATION                                                          */
/* -------------------------------------------------------------------------- */

async function reserveUsage(
  c: any,
  plan: any,
  requestId: string,
  projectId: string,
  provider: string,
  model: string,
  billingMode: string,
  inputLanguage: string,
  outputLanguage: string
) {
  if (!plan) {
    return true;
  }

  const periodStart =
    Number(plan.current_period_start || 0);

  const includedRequests =
    Number(
      plan.included_requests || 0
    );

  /*
   * Reserve one request before calling
   * the external AI provider.
   *
   * This prevents two simultaneous requests
   * from both passing the quota check.
   */
  const result =
    await c.env.DB.prepare(
      `
      INSERT INTO usage_events (
        id,
        request_id,
        tenant_id,
        project_id,
        provider,
        model,
        billing_mode,
        status,
        request_count,
        input_language,
        output_language,
        input_tokens,
        output_tokens,
        total_tokens,
        provider_cost_micros,
        customer_charge_micros,
        created_at
      )
      SELECT
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        'reserved',
        1,
        ?,
        ?,
        0,
        0,
        0,
        0,
        0,
        ?
      WHERE (
        SELECT COALESCE(
          SUM(request_count),
          0
        )
        FROM usage_events
        WHERE tenant_id = ?
          AND created_at >= ?
          AND status IN (
            'reserved',
            'completed'
          )
      ) < ?
      `
    )
      .bind(
        id("use"),
        requestId,
        c.get("auth").tenantId,
        projectId,
        provider,
        model,
        billingMode,
        inputLanguage,
        outputLanguage,
        now(),
        c.get("auth").tenantId,
        periodStart,
        includedRequests
      )
      .run();

  return Number(
    result.meta?.changes || 0
  ) === 1;
}

/* -------------------------------------------------------------------------- */
/* PROVIDER CALL - OPENAI                                                     */
/* -------------------------------------------------------------------------- */

async function callOpenAI(
  env: Env,
  apiKey: string,
  model: string,
  input: unknown,
  responseLanguage?: string,
  stream = false
): Promise<ProviderResult> {
  const system =
    responseLanguage &&
    responseLanguage !== "auto"
      ? `Respond in ${responseLanguage}. Preserve code, URLs, product names and identifiers unless translation is requested.`
      : "Respond in the user's language unless the user explicitly requests another language.";

  const payload: any = {
    model,

    input: [
      {
        role: "system",
        content: system,
      },

      ...(Array.isArray(input)
        ? input
        : [
            {
              role: "user",
              content: String(input),
            },
          ]),
    ],

    stream,
  };

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",

      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `OpenAI error ${response.status}: ${body}`
    );
  }

  if (stream) {
    return {
      provider: "openai",
      model,
      text: "",
      inputTokens: 0,
      outputTokens: 0,
      providerCostMicros: 0,
      stream: response.body!,
    };
  }

  const data: any =
    await response.json();

  const text =
    data.output_text ||
    (data.output || [])
      .flatMap(
        (item: any) =>
          item.content || []
      )
      .map(
        (item: any) =>
          item.text || ""
      )
      .join("");

  const usage =
    data.usage || {};

  const inputTokens =
    Number(
      usage.input_tokens || 0
    );

  const outputTokens =
    Number(
      usage.output_tokens || 0
    );

  return {
    provider: "openai",
    model,
    text,
    inputTokens,
    outputTokens,

    providerCostMicros:
      costMicros(
        "openai",
        model,
        inputTokens,
        outputTokens
      ),
  };
}

/* -------------------------------------------------------------------------- */
/* PROVIDER CALL - GEMINI                                                     */
/* -------------------------------------------------------------------------- */

async function callGemini(
  env: Env,
  apiKey: string,
  model: string,
  input: unknown,
  responseLanguage?: string,
  stream = false
): Promise<ProviderResult> {
  const system =
    responseLanguage &&
    responseLanguage !== "auto"
      ? `Respond in ${responseLanguage}. Preserve code, URLs, product names and identifiers unless translation is requested.`
      : "Respond in the user's language unless the user explicitly requests another language.";

  const contents =
    Array.isArray(input)
      ? input.map(
          (message: any) => ({
            role:
              message.role ===
              "assistant"
                ? "model"
                : "user",

            parts: [
              {
                text:
                  typeof message.content ===
                  "string"
                    ? message.content
                    : JSON.stringify(
                        message.content
                      ),
              },
            ],
          })
        )
      : [
          {
            role: "user",
            parts: [
              {
                text: String(input),
              },
            ],
          },
        ];

  const body = {
    systemInstruction: {
      parts: [
        {
          text: system,
        },
      ],
    },

    contents,
  };

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:` +
    `${
      stream
        ? "streamGenerateContent"
        : "generateContent"
    }` +
    `?key=${encodeURIComponent(apiKey)}` +
    `${stream ? "&alt=sse" : ""}`;

  const response =
    await fetch(endpoint, {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify(body),
    });

  if (!response.ok) {
    const bodyText =
      await response.text();

    throw new Error(
      `Gemini error ${response.status}: ${bodyText}`
    );
  }

  if (stream) {
    return {
      provider: "google",
      model,
      text: "",
      inputTokens: 0,
      outputTokens: 0,
      providerCostMicros: 0,
      stream: response.body!,
    };
  }

  const data: any =
    await response.json();

  const text =
    (data.candidates || [])
      .flatMap(
        (candidate: any) =>
          candidate.content?.parts ||
          []
      )
      .map(
        (part: any) =>
          part.text || ""
      )
      .join("");

  const usage =
    data.usageMetadata || {};

  const inputTokens =
    Number(
      usage.promptTokenCount || 0
    );

  const outputTokens =
    Number(
      usage.candidatesTokenCount ||
        0
    );

  return {
    provider: "google",
    model,
    text,
    inputTokens,
    outputTokens,

    providerCostMicros:
      costMicros(
        "google",
        model,
        inputTokens,
        outputTokens
      ),
  };
}

/* -------------------------------------------------------------------------- */
/* PROVIDER RESOLUTION                                                        */
/* -------------------------------------------------------------------------- */

async function resolveProvider(
  c: any,
  projectId: string,
  requestedProvider?: string
) {
  const auth =
    c.get("auth") as AuthContext;

  let credential: any = null;

  if (requestedProvider) {
    credential =
      await c.env.DB.prepare(
        `
        SELECT
          provider,
          encrypted_credentials
        FROM provider_credentials
        WHERE tenant_id = ?
          AND project_id = ?
          AND provider = ?
          AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
        `
      )
        .bind(
          auth.tenantId,
          projectId,
          requestedProvider
        )
        .first();
  } else {
    credential =
      await c.env.DB.prepare(
        `
        SELECT
          provider,
          encrypted_credentials
        FROM provider_credentials
        WHERE tenant_id = ?
          AND project_id = ?
          AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
        `
      )
        .bind(
          auth.tenantId,
          projectId
        )
        .first();
  }

  /*
   * Tenant-managed BYOK provider.
   */
  if (credential) {
    return {
      mode: "byok",

      provider:
        credential.provider,

      apiKey:
        await decryptText(
          credential.encrypted_credentials,
          c.env.MASTER_KEY
        ),
    };
  }

  /*
   * dLogicAI-managed provider.
   */
  const provider =
    requestedProvider ||
    (c.env.OPENAI_API_KEY
      ? "openai"
      : "google");

  const apiKey =
    provider === "google"
      ? c.env.GEMINI_API_KEY
      : c.env.OPENAI_API_KEY;

  return {
    mode: "managed",
    provider,
    apiKey,
  };
}

/* -------------------------------------------------------------------------- */
/* AUTH - REGISTER                                                            */
/* -------------------------------------------------------------------------- */

app.post(
  "/v1/auth/register",
  async (c) => {
    const schema = z.object({
      name: z
        .string()
        .min(2)
        .max(100),

      email: z
        .string()
        .email()
        .max(255),

      password: z
        .string()
        .min(10)
        .max(200),
    });

    const parsed =
      schema.safeParse(
        await c.req
          .json()
          .catch(() => ({}))
      );

    if (!parsed.success) {
      return jsonError(
        c,
        "INVALID_REQUEST",
        parsed.error.issues[0]
          ?.message ||
          "Invalid request."
      );
    }

    const {
      name,
      email,
      password,
    } = parsed.data;

    const normalizedEmail =
      email.trim().toLowerCase();

    const existing =
      await c.env.DB.prepare(
        "SELECT id FROM users WHERE email = ?"
      )
        .bind(normalizedEmail)
        .first();

    if (existing) {
      return jsonError(
        c,
        "EMAIL_EXISTS",
        "An account with that email already exists.",
        409
      );
    }

    const userId =
      id("usr");

    const tenantId =
      id("ten");

    const membershipId =
      id("mem");

    const slug =
      `${name
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          "-"
        )
        .replace(
          /^-|-$/g,
          ""
        )}-${crypto
        .randomUUID()
        .slice(0, 8)}`;

    const t = now();

    const passwordHash =
      await hashPassword(
        password
      );

    const freePlan = await c.env.DB.prepare(
      "SELECT included_requests FROM plans WHERE id = ?"
    ).bind("plan_free").first<{ included_requests: number }>();

    const initialCredits = Math.max(Number(freePlan?.included_requests || 0), 0);

    await c.env.DB.batch([
      c.env.DB.prepare(
        `
        INSERT INTO users (
          id,
          email,
          name,
          password_hash,
          created_at,
          updated_at
        )
        VALUES (?,?,?,?,?,?)
        `
      ).bind(
        userId,
        normalizedEmail,
        name,
        passwordHash,
        t,
        t
      ),

      c.env.DB.prepare(
        `
        INSERT INTO tenants (
          id,
          name,
          slug,
          created_at,
          updated_at
        )
        VALUES (?,?,?,?,?)
        `
      ).bind(
        tenantId,
        `${name}'s Workspace`,
        slug,
        t,
        t
      ),

      c.env.DB.prepare(
        `
        INSERT INTO memberships (
          id,
          tenant_id,
          user_id,
          role,
          created_at
        )
        VALUES (?,?,?,?,?)
        `
      ).bind(
        membershipId,
        tenantId,
        userId,
        "owner",
        t
      ),

      c.env.DB.prepare(
        `
        INSERT INTO subscriptions (
          id,
          tenant_id,
          plan_id,
          current_period_start,
          current_period_end,
          created_at,
          updated_at
        )
        VALUES (?,?,?,?,?,?,?)
        `
      ).bind(
        id("sub"),
        tenantId,
        "plan_free",
        t,
        t +
          30 *
            86400000,
        t,
        t
      ),
    ]);

    if (initialCredits > 0) {
      await createCreditAccount(c, tenantId, initialCredits);
    }

    const sessionId =
      id("ses");

    await c.env.DB.prepare(
      `
      INSERT INTO sessions (
        id,
        user_id,
        expires_at,
        created_at
      )
      VALUES (?,?,?,?)
      `
    )
      .bind(
        sessionId,
        userId,
        t +
          30 *
            86400000,
        t
      )
      .run();

    c.header(
      "Set-Cookie",
      sessionCookie(
        c,
        sessionId,
        2592000
      )
    );

    return c.json(
      {
        user: {
          id: userId,
          email:
            normalizedEmail,
          name,
        },

        tenant: {
          id: tenantId,
          name: `${name}'s Workspace`,
        },
      },
      201
    );
  }
);

/* -------------------------------------------------------------------------- */
/* AUTH - LOGIN                                                               */
/* -------------------------------------------------------------------------- */

app.post(
  "/v1/auth/login",
  async (c) => {
    const schema = z.object({
      email:
        z.string().email(),

      password:
        z.string().min(1),
    });

    const parsed =
      schema.safeParse(
        await c.req
          .json()
          .catch(() => ({}))
      );

    if (!parsed.success) {
      return jsonError(
        c,
        "INVALID_REQUEST",
        "Invalid email or password."
      );
    }

    const normalizedEmail =
      parsed.data.email
        .trim()
        .toLowerCase();

    const row =
      await c.env.DB.prepare(
        `
        SELECT
          id,
          email,
          name,
          password_hash
        FROM users
        WHERE email = ?
        `
      )
        .bind(normalizedEmail)
        .first<{
          id: string;
          email: string;
          name: string;
          password_hash: string;
        }>();

    if (
      !row ||
      !(await verifyPassword(
        parsed.data.password,
        row.password_hash
      ))
    ) {
      return jsonError(
        c,
        "INVALID_CREDENTIALS",
        "Invalid email or password.",
        401
      );
    }

    const membership =
      await c.env.DB.prepare(
        `
        SELECT tenant_id
        FROM memberships
        WHERE user_id = ?
        ORDER BY created_at ASC
        LIMIT 1
        `
      )
        .bind(row.id)
        .first<{
          tenant_id: string;
        }>();

    if (!membership) {
      return jsonError(
        c,
        "NO_TENANT",
        "No workspace is associated with this account.",
        403
      );
    }

    const sessionId =
      id("ses");

    const t = now();

    await c.env.DB.prepare(
      `
      INSERT INTO sessions (
        id,
        user_id,
        expires_at,
        created_at
      )
      VALUES (?,?,?,?)
      `
    )
      .bind(
        sessionId,
        row.id,
        t +
          30 *
            86400000,
        t
      )
      .run();

    c.header(
      "Set-Cookie",
      sessionCookie(
        c,
        sessionId,
        2592000
      )
    );

    return c.json({
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
      },

      tenantId:
        membership.tenant_id,
    });
  }
);

/* -------------------------------------------------------------------------- */
/* AUTH - LOGOUT                                                              */
/* -------------------------------------------------------------------------- */

app.post(
  "/v1/auth/logout",
  async (c) => {
    const cookies =
      parseCookies(
        c.req.header(
          "Cookie"
        )
      );

    const sessionId =
      cookies[
        "dlogicai_session"
      ];

    if (sessionId) {
      await c.env.DB.prepare(
        "DELETE FROM sessions WHERE id = ?"
      )
        .bind(sessionId)
        .run();
    }

    c.header(
      "Set-Cookie",
      sessionCookie(
        c,
        "",
        0
      )
    );

    return c.json({
      ok: true,
    });
  }
);

/* -------------------------------------------------------------------------- */
/* CURRENT USER                                                               */
/* -------------------------------------------------------------------------- */

app.get(
  "/v1/me",
  async (c) => {
    const auth =
      await sessionAuth(c);

    if (!auth) {
      return jsonError(
        c,
        "UNAUTHORIZED",
        "Authentication required.",
        401
      );
    }

    const user =
      await c.env.DB.prepare(
        `
        SELECT
          id,
          email,
          name
        FROM users
        WHERE id = ?
        `
      )
        .bind(auth.userId)
        .first();

    const tenant =
      await c.env.DB.prepare(
        `
        SELECT
          id,
          name,
          slug,
          default_language
        FROM tenants
        WHERE id = ?
        `
      )
        .bind(auth.tenantId)
        .first();

    const subscription =
      await c.env.DB.prepare(
        `
        SELECT
          s.status,
          p.name AS plan_name,
          p.monthly_price_cents,
          p.included_requests
        FROM subscriptions s
        JOIN plans p
          ON p.id = s.plan_id
        WHERE s.tenant_id = ?
        `
      )
        .bind(auth.tenantId)
        .first();

    return c.json({
      user,
      tenant,
      subscription,
    });
  }
);

/* -------------------------------------------------------------------------- */
/* PLANS                                                                      */
/* -------------------------------------------------------------------------- */

app.get("/v1/plans", async (c) => {
  const result = await c.env.DB.prepare(
    `
    SELECT
      id,
      name,
      monthly_price_cents,
      included_requests,
      included_ai_credit_micros,
      max_projects,
      max_api_keys,
      max_team_members,
      byok_request_fee_micros,
      features_json
    FROM plans
    ORDER BY monthly_price_cents ASC
    `
  ).all();

  return c.json({
    plans: result.results,
  });
});

app.post("/v1/billing/subscription/change", async (c) => {
  const auth = await requireDashboard(c);

  if (!auth) {
    return jsonError(
      c,
      "UNAUTHORIZED",
      "Authentication required.",
      401
    );
  }

  const schema = z.object({
    plan_id: z.string().trim().min(1),
  });

  const parsed = schema.safeParse(
    await c.req.json().catch(() => ({}))
  );

  if (!parsed.success) {
    return jsonError(
      c,
      "INVALID_REQUEST",
      "plan_id is required.",
      400
    );
  }

  const current =
    await c.env.DB.prepare(
      `
      SELECT
        s.id,
        s.tenant_id,
        s.plan_id,
        s.status,
        s.external_customer_id,
        s.external_subscription_id,
        p.name,
        p.monthly_price_cents
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      WHERE s.tenant_id = ?
      ORDER BY s.created_at DESC
      LIMIT 1
      `
    )
      .bind(auth.tenantId)
      .first<any>();

  if (!current) {
    return jsonError(
      c,
      "SUBSCRIPTION_NOT_FOUND",
      "No subscription was found.",
      404
    );
  }

  const target =
    await c.env.DB.prepare(
      `
      SELECT
        id,
        name,
        monthly_price_cents,
        included_requests,
        included_ai_credit_micros,
        max_projects,
        max_api_keys,
        max_team_members,
        byok_request_fee_micros,
        features_json,
        stripe_price_id
      FROM plans
      WHERE id = ?
      LIMIT 1
      `
    )
      .bind(parsed.data.plan_id)
      .first<any>();

  if (!target) {
    return jsonError(
      c,
      "PLAN_NOT_FOUND",
      "The selected plan does not exist.",
      404
    );
  }

  if (current.plan_id === target.id) {
    return jsonError(
      c,
      "CURRENT_PLAN",
      "You are already subscribed to this plan.",
      400
    );
  }

  const planRank: Record<string, number> = {
    plan_free: 0,
    plan_developer: 1,
    plan_pro: 2,
    plan_business: 3,
  };

  const currentRank =
    planRank[String(current.plan_id)] ?? 0;

  const targetRank =
    planRank[String(target.id)] ?? 0;

  if (targetRank <= currentRank) {
    return jsonError(
      c,
      "PLAN_DOWNGRADE_NOT_ALLOWED",
      "Plans can only be upgraded.",
      400
    );
  }

  if (!target.stripe_price_id) {
    return jsonError(
      c,
      "STRIPE_PRICE_NOT_CONFIGURED",
      "The selected plan is not configured for Stripe billing.",
      503
    );
  }

  try {
    let customerId =
      current.external_customer_id ||
      null;

    if (!customerId) {
      const user =
        await c.env.DB.prepare(
          `
          SELECT email, name
          FROM users
          WHERE id = ?
          LIMIT 1
          `
        )
          .bind(auth.userId)
          .first<{
            email: string;
            name: string;
          }>();

      if (!user) {
        return jsonError(
          c,
          "USER_NOT_FOUND",
          "Account owner not found.",
          404
        );
      }

      const customer =
        await stripeRequest(
          c.env,
          "/customers",
          "POST",
          {
            email: user.email,
            name: user.name,
            "metadata[tenant_id]":
              auth.tenantId,
          }
        );

      customerId = customer.id;

      await c.env.DB.prepare(
        `
        UPDATE subscriptions
        SET external_customer_id = ?, updated_at = ?
        WHERE id = ? AND tenant_id = ?
        `
      )
        .bind(
          customerId,
          now(),
          current.id,
          auth.tenantId
        )
        .run();
    }

    // Initial paid subscription: use Checkout.
    if (!current.external_subscription_id) {
      const successUrl =
        c.env.STRIPE_SUCCESS_URL;

      const cancelUrl =
        c.env.STRIPE_CANCEL_URL;

      if (!successUrl || !cancelUrl) {
        return jsonError(
          c,
          "STRIPE_URLS_NOT_CONFIGURED",
          "STRIPE_SUCCESS_URL and STRIPE_CANCEL_URL must be configured.",
          503
        );
      }

      const session =
        await stripeRequest(
          c.env,
          "/checkout/sessions",
          "POST",
          {
            mode: "subscription",
            customer: customerId,
            "client_reference_id":
              auth.tenantId,
            "line_items[0][price]":
              target.stripe_price_id,
            "line_items[0][quantity]": 1,
            success_url: successUrl,
            cancel_url: cancelUrl,
            "metadata[tenant_id]":
              auth.tenantId,
            "metadata[plan_id]":
              target.id,
            "metadata[internal_subscription_id]":
              current.id,
            "subscription_data[metadata][tenant_id]":
              auth.tenantId,
            "subscription_data[metadata][plan_id]":
              target.id,
            "subscription_data[metadata][internal_subscription_id]":
              current.id,
          }
        );

      return c.json({
        success: true,
        mode: "checkout",
        checkout_url: session.url,
        session_id: session.id,
      });
    }

    // Existing paid subscription: change the Stripe price.
    // Stripe webhooks remain the source of truth for the local plan/status.
    const updated =
      await stripeRequest(
        c.env,
        `/subscriptions/${encodeURIComponent(
          current.external_subscription_id
        )}`,
        "POST",
        {
          "items[0][price]":
            target.stripe_price_id,
          "proration_behavior":
            "always_invoice",
          "payment_behavior":
            "pending_if_incomplete",
          "metadata[tenant_id]":
            auth.tenantId,
          "metadata[plan_id]":
            target.id,
          "metadata[internal_subscription_id]":
            current.id,
        }
      );

    await syncStripeSubscription(
      c,
      updated
    );

    return c.json({
      success: true,
      mode: "subscription_update",
      subscription: {
        id: current.id,
        plan_id: target.id,
        plan_name: target.name,
        status:
          updated.status ||
          current.status,
      },
    });
  } catch (error: any) {
    console.error(
      "DLOGICAI_STRIPE_CHECKOUT_ERROR",
      {
        tenantId: auth.tenantId,
        targetPlanId: target.id,
        error:
          error?.message ||
          String(error),
      }
    );

    return jsonError(
      c,
      "STRIPE_ERROR",
      "Unable to start or update Stripe billing.",
      502
    );
  }
});

/* -------------------------------------------------------------------------- */
/* STRIPE WEBHOOK                                                             */
/* -------------------------------------------------------------------------- */

app.post("/v1/billing/stripe/webhook", async (c) => {
  const signature =
    c.req.header("Stripe-Signature");

  const payload =
    await c.req.text();

  const valid =
    await verifyStripeSignature(
      payload,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET
    );

  if (!valid) {
    return jsonError(
      c,
      "INVALID_STRIPE_SIGNATURE",
      "Invalid Stripe webhook signature.",
      400
    );
  }

  let event: any;

  try {
    event = JSON.parse(payload);
  } catch {
    return jsonError(
      c,
      "INVALID_STRIPE_EVENT",
      "Invalid Stripe event payload.",
      400
    );
  }

  if (
    !event?.id ||
    typeof event.id !== "string" ||
    typeof event.type !== "string"
  ) {
    return jsonError(
      c,
      "INVALID_STRIPE_EVENT",
      "Invalid Stripe event.",
      400
    );
  }

  // Idempotency: Stripe may retry delivery, and event ordering is not guaranteed.
  const existing =
    await c.env.DB.prepare(
      `
      SELECT status
      FROM stripe_events
      WHERE id = ?
      LIMIT 1
      `
    )
      .bind(event.id)
      .first<{ status: string }>();

  if (existing?.status === "processed") {
    return c.json({ received: true });
  }

  if (!existing) {
    await c.env.DB.prepare(
      `
      INSERT OR IGNORE INTO stripe_events (
        id,
        event_type,
        status,
        created_at
      )
      VALUES (?, ?, 'received', ?)
      `
    )
      .bind(
        event.id,
        event.type,
        now()
      )
      .run();
  }

  try {
    await handleStripeEvent(
      c,
      event
    );

    await c.env.DB.prepare(
      `
      UPDATE stripe_events
      SET
        status = 'processed',
        processed_at = ?,
        error_message = NULL
      WHERE id = ?
      `
    )
      .bind(
        now(),
        event.id
      )
      .run();

    return c.json({
      received: true,
    });
  } catch (error: any) {
    const message =
      error?.message ||
      String(error);

    await c.env.DB.prepare(
      `
      UPDATE stripe_events
      SET
        status = 'failed',
        error_message = ?
      WHERE id = ?
      `
    )
      .bind(
        message.slice(0, 1000),
        event.id
      )
      .run()
      .catch(() => undefined);

    console.error(
      "DLOGICAI_STRIPE_WEBHOOK_ERROR",
      {
        eventId: event.id,
        eventType: event.type,
        error: message,
      }
    );

    // Return 500 so Stripe retries the event.
    return jsonError(
      c,
      "STRIPE_WEBHOOK_PROCESSING_FAILED",
      "Stripe event processing failed.",
      500
    );
  }
});
/* -------------------------------------------------------------------------- */
/* CURRENT SUBSCRIPTION                                                       */
/* -------------------------------------------------------------------------- */

app.get(
  "/v1/billing/subscription",
  async (c) => {
    const auth =
      await requireDashboard(c);

    if (!auth) {
      return jsonError(
        c,
        "UNAUTHORIZED",
        "Authentication required.",
        401
      );
    }

    const subscription =
      await c.env.DB.prepare(
        `
        SELECT
          s.id,
          s.tenant_id,
          s.plan_id,
          s.status,
          s.current_period_start,
          s.current_period_end,
          s.external_customer_id,
          s.external_subscription_id,

          p.name AS plan_name,
          p.monthly_price_cents,
          p.included_requests,
          p.included_ai_credit_micros,
          p.max_projects,
          p.max_api_keys,
          p.max_team_members,
          p.byok_request_fee_micros,
          p.features_json

        FROM subscriptions s

        JOIN plans p
          ON p.id = s.plan_id

        WHERE s.tenant_id = ?

        ORDER BY s.created_at DESC

        LIMIT 1
        `
      )
        .bind(auth.tenantId)
        .first();

    if (!subscription) {
      return jsonError(
        c,
        "SUBSCRIPTION_NOT_FOUND",
        "No active subscription found.",
        404
      );
    }

    const creditAccount =
      await getCreditAccount(
        c,
        auth.tenantId
      );

    const availableCredits =
      creditAccount
        ? totalAvailableCredits(
            creditAccount
          )
        : 0;

    return c.json({
      subscription,

      credits: {
        subscription:
          creditAccount?.subscription_balance || 0,

        purchased:
          creditAccount?.purchased_balance || 0,

        promotional:
          creditAccount?.promotional_balance || 0,

        available:
          availableCredits,

        total_consumed:
          creditAccount?.total_consumed || 0,

        auto_topup: {
          enabled:
            Boolean(
              creditAccount?.auto_topup_enabled
            ),

          threshold:
            creditAccount?.auto_topup_threshold || 0,

          credits:
            creditAccount?.auto_topup_credits || 0,

          limit:
            creditAccount?.auto_topup_limit || 0,
        },
      },
    });
  }
);
/* -------------------------------------------------------------------------- */
/* AI CREDITS - BALANCE                                                       */
/* -------------------------------------------------------------------------- */

app.get("/v1/billing/credits", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

  const account = await getCreditAccount(c, auth.tenantId);
  if (!account) return c.json({ credits: { subscription: 0, purchased: 0, promotional: 0, available: 0, total_consumed: 0 } });

  return c.json({
    credits: {
      subscription: account.subscription_balance,
      purchased: account.purchased_balance,
      promotional: account.promotional_balance,
      available: totalAvailableCredits(account),
      total_consumed: account.total_consumed,
      auto_topup: { enabled: Boolean(account.auto_topup_enabled), threshold: account.auto_topup_threshold, credits: account.auto_topup_credits, limit: account.auto_topup_limit }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* PROJECTS - LIST                                                            */
/* -------------------------------------------------------------------------- */

app.get(
  "/v1/projects",
  async (c) => {
    const auth =
      await requireDashboard(c);

    if (!auth) {
      return jsonError(
        c,
        "UNAUTHORIZED",
        "Authentication required.",
        401
      );
    }

    const rows =
      await c.env.DB.prepare(
        `
        SELECT
          id,
          name,
          environment,
          status,
          created_at,
          updated_at
        FROM projects
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        `
      )
        .bind(auth.tenantId)
        .all();

    return c.json({
      projects:
        rows.results,
    });
  }
);

/* -------------------------------------------------------------------------- */
/* PROJECTS - CREATE                                                          */
/* -------------------------------------------------------------------------- */

app.post(
  "/v1/projects",
  async (c) => {
    const auth =
      await requireDashboard(c);

    if (!auth) {
      return jsonError(
        c,
        "UNAUTHORIZED",
        "Authentication required.",
        401
      );
    }

    const schema =
      z.object({
        name: z
          .string()
          .min(1)
          .max(100),

        environment:
          z
            .enum([
              "development",
              "staging",
              "production",
            ])
            .default(
              "production"
            ),
      });

    const parsed =
      schema.safeParse(
        await c.req
          .json()
          .catch(() => ({}))
      );

    if (!parsed.success) {
      return jsonError(
        c,
        "INVALID_REQUEST",
        "Invalid project."
      );
    }

    const subscription =
      await c.env.DB.prepare(
        `
        SELECT
          p.max_projects
        FROM subscriptions s
        JOIN plans p
          ON p.id = s.plan_id
        WHERE s.tenant_id = ?
        `
      )
        .bind(auth.tenantId)
        .first<{
          max_projects: number;
        }>();

    const count =
      await c.env.DB.prepare(
        `
        SELECT COUNT(*) AS count
        FROM projects
        WHERE tenant_id = ?
        `
      )
        .bind(auth.tenantId)
        .first<{
          count: number;
        }>();

    if (
      subscription &&
      Number(
        count?.count || 0
      ) >=
        Number(
          subscription.max_projects
        )
    ) {
      return jsonError(
        c,
        "PROJECT_LIMIT",
        "Your plan has reached its project limit.",
        402
      );
    }

    const projectId =
      id("prj");

    const t = now();

    await c.env.DB.prepare(
      `
      INSERT INTO projects (
        id,
        tenant_id,
        name,
        environment,
        created_at,
        updated_at
      )
      VALUES (?,?,?,?,?,?)
      `
    )
      .bind(
        projectId,
        auth.tenantId,
        parsed.data.name,
        parsed.data.environment,
        t,
        t
      )
      .run();

    return c.json(
      {
        project: {
          id: projectId,
          ...parsed.data,
        },
      },
      201
    );
  }
);

/* -------------------------------------------------------------------------- */
/* API KEYS - CREATE                                                          */
/* -------------------------------------------------------------------------- */


/* -------------------------------------------------------------------------- */
/* CHAT SERVICES                                                              */
/* -------------------------------------------------------------------------- */

app.get("/v1/projects/:projectId/chat-services", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

  const projectId = c.req.param("projectId");
  const project = await c.env.DB.prepare(
    "SELECT id, name, environment, status FROM projects WHERE id=? AND tenant_id=?"
  ).bind(projectId, auth.tenantId).first();

  if (!project) return jsonError(c, "NOT_FOUND", "Project not found.", 404);

  const rows = await c.env.DB.prepare(`
    SELECT id, project_id, name, description, environment, status,
           default_language, ai_provider, model,
           enable_intelligence, enable_emotion_analysis,
           enable_upsell_analysis, created_at, updated_at
    FROM chat_services
    WHERE tenant_id=? AND project_id=? AND status != 'deleted'
    ORDER BY created_at DESC
  `).bind(auth.tenantId, projectId).all();

  return c.json({ chat_services: rows.results });
});

app.post("/v1/projects/:projectId/chat-services", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

  const projectId = c.req.param("projectId");
  const project = await c.env.DB.prepare(
    "SELECT id, environment, status FROM projects WHERE id=? AND tenant_id=?"
  ).bind(projectId, auth.tenantId).first<{ id: string; environment: string; status: string }>();

  if (!project) return jsonError(c, "NOT_FOUND", "Project not found.", 404);
  if (project.status !== "active") return jsonError(c, "PROJECT_INACTIVE", "The selected project is not active.", 409);

  const schema = z.object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional(),
    environment: z.enum(["development", "staging", "production"]).default("development"),
    default_language: z.string().trim().min(2).max(20).default("auto"),
    ai_provider: z.enum(["auto", "openai", "google"]).default("auto"),
    model: z.string().trim().min(1).max(100).default("auto"),
    enable_intelligence: z.boolean().default(true),
    enable_emotion_analysis: z.boolean().default(true),
    enable_upsell_analysis: z.boolean().default(true),
  });

  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(c, "INVALID_REQUEST", "Invalid Chat Service configuration.", 400);

  const duplicate = await c.env.DB.prepare(`
    SELECT id FROM chat_services
    WHERE tenant_id=? AND project_id=? AND lower(name)=lower(?) AND status != 'deleted'
    LIMIT 1
  `).bind(auth.tenantId, projectId, parsed.data.name).first();

  if (duplicate) return jsonError(c, "CHAT_SERVICE_EXISTS", "A Chat Service with this name already exists in this project.", 409);

  const serviceId = id("chat");
  const t = now();

  await c.env.DB.prepare(`
    INSERT INTO chat_services (
      id, tenant_id, project_id, name, description, environment, status,
      default_language, ai_provider, model, enable_intelligence,
      enable_emotion_analysis, enable_upsell_analysis, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    serviceId,
    auth.tenantId,
    projectId,
    parsed.data.name,
    parsed.data.description ?? null,
    parsed.data.environment,
    parsed.data.default_language,
    parsed.data.ai_provider,
    parsed.data.model,
    parsed.data.enable_intelligence ? 1 : 0,
    parsed.data.enable_emotion_analysis ? 1 : 0,
    parsed.data.enable_upsell_analysis ? 1 : 0,
    t,
    t,
  ).run();

  const service = await c.env.DB.prepare(`
    SELECT id, project_id, name, description, environment, status,
           default_language, ai_provider, model,
           enable_intelligence, enable_emotion_analysis,
           enable_upsell_analysis, created_at, updated_at
    FROM chat_services WHERE id=? AND tenant_id=? AND project_id=?
  `).bind(serviceId, auth.tenantId, projectId).first();

  return c.json({ chat_service: service }, 201);
});

app.get("/v1/projects/:projectId/chat-services/:serviceId", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

  const service = await c.env.DB.prepare(`
    SELECT id, project_id, name, description, environment, status,
           default_language, ai_provider, model,
           enable_intelligence, enable_emotion_analysis,
           enable_upsell_analysis, created_at, updated_at
    FROM chat_services
    WHERE id=? AND project_id=? AND tenant_id=? AND status != 'deleted'
  `).bind(c.req.param("serviceId"), c.req.param("projectId"), auth.tenantId).first();

  if (!service) return jsonError(c, "NOT_FOUND", "Chat Service not found.", 404);
  return c.json({ chat_service: service });
});

app.patch("/v1/projects/:projectId/chat-services/:serviceId", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

  const projectId = c.req.param("projectId");
  const serviceId = c.req.param("serviceId");
  const existing = await c.env.DB.prepare(
    "SELECT * FROM chat_services WHERE id=? AND project_id=? AND tenant_id=? AND status != 'deleted'"
  ).bind(serviceId, projectId, auth.tenantId).first<any>();

  if (!existing) return jsonError(c, "NOT_FOUND", "Chat Service not found.", 404);

  const schema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    environment: z.enum(["development", "staging", "production"]).optional(),
    status: z.enum(["active", "paused"]).optional(),
    default_language: z.string().trim().min(2).max(20).optional(),
    ai_provider: z.enum(["auto", "openai", "google"]).optional(),
    model: z.string().trim().min(1).max(100).optional(),
    enable_intelligence: z.boolean().optional(),
    enable_emotion_analysis: z.boolean().optional(),
    enable_upsell_analysis: z.boolean().optional(),
  });

  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(c, "INVALID_REQUEST", "Invalid Chat Service update.", 400);

  const d = parsed.data;
  const next = {
    name: d.name ?? existing.name,
    description: d.description === undefined ? existing.description : d.description,
    environment: d.environment ?? existing.environment,
    status: d.status ?? existing.status,
    default_language: d.default_language ?? existing.default_language,
    ai_provider: d.ai_provider ?? existing.ai_provider,
    model: d.model ?? existing.model,
    enable_intelligence: d.enable_intelligence === undefined ? existing.enable_intelligence : (d.enable_intelligence ? 1 : 0),
    enable_emotion_analysis: d.enable_emotion_analysis === undefined ? existing.enable_emotion_analysis : (d.enable_emotion_analysis ? 1 : 0),
    enable_upsell_analysis: d.enable_upsell_analysis === undefined ? existing.enable_upsell_analysis : (d.enable_upsell_analysis ? 1 : 0),
  };

  await c.env.DB.prepare(`
    UPDATE chat_services SET
      name=?, description=?, environment=?, status=?, default_language=?,
      ai_provider=?, model=?, enable_intelligence=?, enable_emotion_analysis=?,
      enable_upsell_analysis=?, updated_at=?
    WHERE id=? AND tenant_id=? AND project_id=?
  `).bind(
    next.name, next.description, next.environment, next.status,
    next.default_language, next.ai_provider, next.model,
    next.enable_intelligence, next.enable_emotion_analysis,
    next.enable_upsell_analysis, now(), serviceId, auth.tenantId, projectId,
  ).run();

  const service = await c.env.DB.prepare("SELECT * FROM chat_services WHERE id=? AND tenant_id=? AND project_id=?")
    .bind(serviceId, auth.tenantId, projectId).first();

  return c.json({ chat_service: service });
});

app.delete("/v1/projects/:projectId/chat-services/:serviceId", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

  const result = await c.env.DB.prepare(`
    UPDATE chat_services SET status='deleted', updated_at=?
    WHERE id=? AND project_id=? AND tenant_id=? AND status != 'deleted'
  `).bind(now(), c.req.param("serviceId"), c.req.param("projectId"), auth.tenantId).run();

  if (Number(result.meta?.changes || 0) !== 1) return jsonError(c, "NOT_FOUND", "Chat Service not found.", 404);
  return c.json({ ok: true });
});

app.post(
  "/v1/projects/:projectId/api-keys",
  async (c) => {
    const auth =
      await requireDashboard(c);

    if (!auth) {
      return jsonError(
        c,
        "UNAUTHORIZED",
        "Authentication required.",
        401
      );
    }

    const project =
      await c.env.DB.prepare(
        `
        SELECT id
        FROM projects
        WHERE id = ?
          AND tenant_id = ?
        `
      )
        .bind(
          c.req.param(
            "projectId"
          ),
          auth.tenantId
        )
        .first<{
          id: string;
        }>();

    if (!project) {
      return jsonError(
        c,
        "NOT_FOUND",
        "Project not found.",
        404
      );
    }

    const body =
      await c.req
        .json()
        .catch(() => ({}));

    const name =
      typeof body.name ===
      "string"
        ? body.name
            .trim()
            .slice(0, 100)
        : "API key";

    const plan =
      await c.env.DB.prepare(
        `
        SELECT
          p.max_api_keys
        FROM subscriptions s
        JOIN plans p
          ON p.id = s.plan_id
        WHERE s.tenant_id = ?
        `
      )
        .bind(auth.tenantId)
        .first<{
          max_api_keys: number;
        }>();

    const count =
      await c.env.DB.prepare(
        `
        SELECT COUNT(*) AS count
        FROM api_keys
        WHERE tenant_id = ?
          AND status = 'active'
        `
      )
        .bind(auth.tenantId)
        .first<{
          count: number;
        }>();

    if (
      plan &&
      Number(
        count?.count || 0
      ) >=
        Number(
          plan.max_api_keys
        )
    ) {
      return jsonError(
        c,
        "API_KEY_LIMIT",
        "Your plan has reached its API key limit.",
        402
      );
    }

    const secret =
      `sk_live_${bytesToHex(
        crypto.getRandomValues(
          new Uint8Array(24)
        )
      )}`;

    const keyHash =
      await sha256(secret);

    const keyId =
      id("key");

    const prefix =
      secret.slice(0, 16);

    const t = now();

    await c.env.DB.prepare(
      `
      INSERT INTO api_keys (
        id,
        tenant_id,
        project_id,
        name,
        key_prefix,
        key_hash,
        created_at
      )
      VALUES (?,?,?,?,?,?,?)
      `
    )
      .bind(
        keyId,
        auth.tenantId,
        project.id,
        name,
        prefix,
        keyHash,
        t
      )
      .run();

    return c.json(
      {
        api_key: {
          id: keyId,
          name,
          prefix,
          secret,
          created_at: t,
        },

        warning:
          "Store this secret now. It will not be shown again.",
      },
      201
    );
  }
);

/* -------------------------------------------------------------------------- */
/* API KEYS - LIST                                                            */
/* -------------------------------------------------------------------------- */

app.get(
  "/v1/projects/:projectId/api-keys",
  async (c) => {
    const auth =
      await requireDashboard(c);

    if (!auth) {
      return jsonError(
        c,
        "UNAUTHORIZED",
        "Authentication required.",
        401
      );
    }

    const rows =
      await c.env.DB.prepare(
        `
        SELECT
          id,
          name,
          key_prefix,
          status,
          created_at,
          last_used_at
        FROM api_keys
        WHERE tenant_id = ?
          AND project_id = ?
        ORDER BY created_at DESC
        `
      )
        .bind(
          auth.tenantId,
          c.req.param(
            "projectId"
          )
        )
        .all();

    return c.json({
      api_keys:
        rows.results,
    });
  }
);

/* -------------------------------------------------------------------------- */
/* PROVIDERS - CREATE BYOK                                                    */
/* -------------------------------------------------------------------------- */

app.post(
  "/v1/projects/:projectId/providers",
  async (c) => {
    const auth =
      await requireDashboard(c);

    if (!auth) {
      return jsonError(
        c,
        "UNAUTHORIZED",
        "Authentication required.",
        401
      );
    }

    const project =
      await c.env.DB.prepare(
        `
        SELECT id
        FROM projects
        WHERE id = ?
          AND tenant_id = ?
        `
      )
        .bind(
          c.req.param(
            "projectId"
          ),
          auth.tenantId
        )
        .first<{
          id: string;
        }>();

    if (!project) {
      return jsonError(
        c,
        "NOT_FOUND",
        "Project not found.",
        404
      );
    }

    const schema =
      z.object({
        provider:
          z.enum([
            "openai",
            "google",
          ]),

        name: z
          .string()
          .min(1)
          .max(80),

        api_key: z
          .string()
          .min(10)
          .max(1000),
      });

    const parsed =
      schema.safeParse(
        await c.req
          .json()
          .catch(() => ({}))
      );

    if (!parsed.success) {
      return jsonError(
        c,
        "INVALID_REQUEST",
        "Provider and API key are required."
      );
    }

    const encrypted =
      await encryptText(
        parsed.data.api_key,
        c.env.MASTER_KEY
      );

    const credentialId =
      id("cred");

    const t = now();

    await c.env.DB.prepare(
      `
      INSERT INTO provider_credentials (
        id,
        tenant_id,
        project_id,
        provider,
        name,
        encrypted_credentials,
        created_at
      )
      VALUES (?,?,?,?,?,?,?)
      `
    )
      .bind(
        credentialId,
        auth.tenantId,
        project.id,
        parsed.data.provider,
        parsed.data.name,
        encrypted,
        t
      )
      .run();

    return c.json(
      {
        credential: {
          id: credentialId,
          provider:
            parsed.data.provider,
          name:
            parsed.data.name,
        },
      },
      201
    );
  }
);

/* -------------------------------------------------------------------------- */
/* PROVIDERS - LIST                                                           */
/* -------------------------------------------------------------------------- */

app.get(
  "/v1/projects/:projectId/providers",
  async (c) => {
    const auth =
      await requireDashboard(c);

    if (!auth) {
      return jsonError(
        c,
        "UNAUTHORIZED",
        "Authentication required.",
        401
      );
    }

    const rows =
      await c.env.DB.prepare(
        `
        SELECT
          id,
          provider,
          name,
          status,
          created_at,
          last_used_at
        FROM provider_credentials
        WHERE tenant_id = ?
          AND project_id = ?
        ORDER BY created_at DESC
        `
      )
        .bind(
          auth.tenantId,
          c.req.param(
            "projectId"
          )
        )
        .all();

    return c.json({
      providers:
        rows.results,
    });
  }
);

/* -------------------------------------------------------------------------- */
/* RESPONSES                                                                  */
/* -------------------------------------------------------------------------- */

app.post(
  "/v1/responses",
  async (c) => {
    const auth =
      await requireApi(c);

    /*
     * IMPORTANT:
     * Never return null from a Hono route.
     */
    if (!auth) {
      return jsonError(
        c,
        "INVALID_API_KEY",
        "A valid dLogicAI API key is required.",
        401
      );
    }

    const projectId =
      c.get(
        "apiProjectId"
      ) as string;

    if (!projectId) {
      return jsonError(
        c,
        "AUTH_CONTEXT_ERROR",
        "API key has no project.",
        500
      );
    }

    const schema =
      z.object({
        model:
          z.string()
            .default("auto"),

        provider:
          z.enum([
            "openai",
            "google",
          ]).optional(),

        input:
          z.any(),

        conversation_id:
          z.string()
            .optional(),

        language:
          z.string()
            .default("auto"),

        response_language:
          z.string()
            .default("auto"),

        locale:
          z.string()
            .optional(),

        stream:
          z.boolean()
            .default(false),
      });

    const parsed =
      schema.safeParse(
        await c.req
          .json()
          .catch(() => ({}))
      );

    if (!parsed.success) {
      return jsonError(
        c,
        "INVALID_REQUEST",
        "Invalid response request."
      );
    }

    const plan =
      await c.env.DB.prepare(
        `
        SELECT
          p.*,
          s.current_period_start
        FROM subscriptions s
        JOIN plans p
          ON p.id = s.plan_id
        WHERE s.tenant_id = ?
        `
      )
        .bind(auth.tenantId)
        .first<any>();

    const textInput =
      extractText(
        parsed.data.input
      );

    const inputLanguage =
      parsed.data.language ===
      "auto"
        ? await detectLanguage(
            textInput
          )
        : parsed.data.language;

    const resolved =
      await resolveProvider(
        c,
        projectId,
        parsed.data.provider
      );

    if (!resolved.apiKey) {
      return jsonError(
        c,
        "NO_PROVIDER",
        "No AI provider is configured for this project.",
        400
      );
    }

    let model =
      parsed.data.model;

    if (model === "auto") {
      model =
        resolved.provider ===
        "openai"
          ? "gpt-5-mini"
          : "gemini-2.5-flash-lite";
    }

    const requestId =
      id("req");

    const creditReservation = await reserveCredits(
      c,
      auth.tenantId,
      requestId,
      projectId,
      1
    );

    if (!creditReservation.ok) {
      return jsonError(
        c,
        creditReservation.code,
        creditReservation.code === "NO_CREDIT_ACCOUNT"
          ? "No AI credit account is configured for this tenant."
          : "Insufficient AI credits. Please purchase additional credits or wait for your subscription credits to renew.",
        402
      );
    }

    const conversationId =
      parsed.data
        .conversation_id ||
      id("conv");

    const t = now();

    const outputLanguage =
      parsed.data
        .response_language ===
      "auto"
        ? inputLanguage
        : parsed.data
            .response_language;

    /*
     * Reserve quota BEFORE provider call.
     */
    const reserved =
      await reserveUsage(
        c,
        plan,
        requestId,
        projectId,
        resolved.provider,
        model,
        resolved.mode,
        inputLanguage,
        outputLanguage
      );

    if (!reserved) {
      return jsonError(
        c,
        "QUOTA_EXCEEDED",
        "Monthly API request quota exceeded.",
        402
      );
    }

    try {
      const result =
        resolved.provider ===
        "openai"
          ? await callOpenAI(
              c.env,
              resolved.apiKey,
              model,
              parsed.data.input,
              parsed.data
                .response_language,
              parsed.data.stream
            )
          : await callGemini(
              c.env,
              resolved.apiKey,
              model,
              parsed.data.input,
              parsed.data
                .response_language,
              parsed.data.stream
            );

      /* -------------------------------------------------------------------- */
      /* STREAMING                                                            */
      /* -------------------------------------------------------------------- */

      if (
        parsed.data.stream
      ) {
        const providerStream =
          result.stream!;

        const reader =
          providerStream.getReader();

        const encoder =
          new TextEncoder();

        const decoder =
          new TextDecoder();

        const stream =
          new ReadableStream<
            Uint8Array
          >({
            async pull(
              controller
            ) {
              try {
                const {
                  done,
                  value,
                } =
                  await reader.read();

                if (done) {
                  await c.env.DB.prepare(
                    `
                    UPDATE usage_events
                    SET
                      status = 'completed'
                    WHERE request_id = ?
                      AND status = 'reserved'
                    `
                  )
                    .bind(
                      requestId
                    )
                    .run();

                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify(
                        {
                          type: "response.completed",
                          request_id:
                            requestId,
                        }
                      )}\n\n`
                    )
                  );

                  controller.close();

                  return;
                }

controller.enqueue(
  encoder.encode(
    `data: ${JSON.stringify({
      type: "response.provider_event",
      data: decoder.decode(value, {
        stream: true,
      }),
    })}\n\n`
  )
);
              } catch (error) {
                await c.env.DB.prepare(
                  `
                  UPDATE usage_events
                  SET status = 'failed'
                  WHERE request_id = ?
                    AND status = 'reserved'
                  `
                )
                  .bind(
                    requestId
                  )
                  .run();

                controller.error(
                  error
                );
              }
            },

            async cancel() {
              await reader.cancel();

              await c.env.DB.prepare(
                `
                UPDATE usage_events
                SET status = 'failed'
                WHERE request_id = ?
                  AND status = 'reserved'
                `
              )
                .bind(
                  requestId
                )
                .run();
            },
          });

        return new Response(
          stream,
          {
            headers: {
              "Content-Type":
                "text/event-stream",

              "Cache-Control":
                "no-cache",

              Connection:
                "keep-alive",

              "X-Request-ID":
                requestId,
            },
          }
        );
      }

      /* -------------------------------------------------------------------- */
      /* NON-STREAMING                                                        */
      /* -------------------------------------------------------------------- */

      const byokFee =
        resolved.mode ===
        "byok"
          ? Number(
              plan?.byok_request_fee_micros ||
                0
            )
          : 0;

      const customerCharge =
        resolved.mode ===
        "byok"
          ? byokFee
          : Math.round(
              result.providerCostMicros *
                1.35
            );

      /*
       * Complete the reservation
       * and persist conversation data
       * in one D1 batch.
       */
      await c.env.DB.batch([
        c.env.DB.prepare(
          `
          INSERT INTO conversations (
            id,
            tenant_id,
            project_id,
            title,
            model,
            language,
            locale,
            created_at,
            updated_at
          )
          VALUES (?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id)
          DO UPDATE SET
            updated_at =
              excluded.updated_at,
            model =
              excluded.model,
            language =
              excluded.language,
            locale =
              excluded.locale
          `
        ).bind(
          conversationId,
          auth.tenantId,
          projectId,
          textInput.slice(
            0,
            100
          ),
          model,
          inputLanguage,
          parsed.data.locale ||
            null,
          t,
          t
        ),

        c.env.DB.prepare(
          `
          INSERT INTO messages (
            id,
            conversation_id,
            role,
            content,
            input_tokens,
            output_tokens,
            created_at
          )
          VALUES (?,?,?,?,?,?,?)
          `
        ).bind(
          id("msg"),
          conversationId,
          "user",
          textInput,
          result.inputTokens,
          result.outputTokens,
          t
        ),

        c.env.DB.prepare(
          `
          INSERT INTO messages (
            id,
            conversation_id,
            role,
            content,
            input_tokens,
            output_tokens,
            created_at
          )
          VALUES (?,?,?,?,?,?,?)
          `
        ).bind(
          id("msg"),
          conversationId,
          "assistant",
          result.text,
          result.inputTokens,
          result.outputTokens,
          t
        ),

        c.env.DB.prepare(
          `
          UPDATE usage_events
          SET
            status = 'completed',
            input_tokens = ?,
            output_tokens = ?,
            total_tokens = ?,
            provider_cost_micros = ?,
            customer_charge_micros = ?
          WHERE request_id = ?
            AND status = 'reserved'
          `
        ).bind(
          result.inputTokens,
          result.outputTokens,
          result.inputTokens +
            result.outputTokens,
          result.providerCostMicros,
          customerCharge,
          requestId
        ),
      ]);

      await c.env.DB.prepare(
        `UPDATE credit_reservations SET status = 'completed' WHERE request_id = ? AND status = 'reserved'`
      ).bind(requestId).run();

      return c.json({
        id: requestId,

        conversation_id:
          conversationId,

        model,

        provider:
          resolved.provider,

        billing_mode:
          resolved.mode,

        output_text:
          result.text,

        language: {
          input:
            inputLanguage,

          output:
            outputLanguage,

          locale:
            parsed.data.locale ||
            null,
        },

        usage: {
          input_tokens:
            result.inputTokens,

          output_tokens:
            result.outputTokens,

          total_tokens:
            result.inputTokens +
            result.outputTokens,
        },
      });
    } catch (error: any) {
      /*
       * IMPORTANT:
       * Release the reservation by marking
       * the request as failed.
       */
      await c.env.DB.prepare(
        `
        UPDATE usage_events
        SET status = 'failed'
        WHERE request_id = ?
          AND status = 'reserved'
        `
      )
        .bind(requestId)
        .run()
        .catch(() => undefined);

      await c.env.DB.prepare(
        `UPDATE credit_reservations SET status = 'failed' WHERE request_id = ? AND status = 'reserved'`
      ).bind(requestId).run().catch(() => undefined);

      console.error(
        "DLOGICAI_PROVIDER_ERROR",
        {
          requestId,
          tenantId:
            auth.tenantId,
          projectId,
          provider:
            resolved.provider,
          model,
          error:
            error?.message ||
            String(error),
        }
      );

      return jsonError(
        c,
        "PROVIDER_ERROR",
        error?.message ||
          "AI provider request failed.",
        502
      );
    }
  }
);

/* -------------------------------------------------------------------------- */
/* USAGE                                                                       */
/* -------------------------------------------------------------------------- */

app.get(
  "/v1/usage",
  async (c) => {
    const auth =
      await requireDashboard(c);

    if (!auth) {
      return jsonError(
        c,
        "UNAUTHORIZED",
        "Authentication required.",
        401
      );
    }

    let days =
      Number(
        c.req.query("days") ||
          30
      );

    if (
      !Number.isFinite(days)
    ) {
      days = 30;
    }

    days = Math.min(
      Math.max(
        Math.floor(days),
        1
      ),
      365
    );

    const since =
      now() -
      days *
        86400000;

    const summary =
      await c.env.DB.prepare(
        `
        SELECT
          COUNT(*) AS requests,
          COALESCE(
            SUM(input_tokens),
            0
          ) AS input_tokens,
          COALESCE(
            SUM(output_tokens),
            0
          ) AS output_tokens,
          COALESCE(
            SUM(provider_cost_micros),
            0
          ) AS provider_cost_micros,
          COALESCE(
            SUM(customer_charge_micros),
            0
          ) AS customer_charge_micros
        FROM usage_events
        WHERE tenant_id = ?
          AND created_at >= ?
          AND status = 'completed'
        `
      )
        .bind(
          auth.tenantId,
          since
        )
        .first();

    const byProvider =
      await c.env.DB.prepare(
        `
        SELECT
          provider,
          billing_mode,
          COUNT(*) AS requests,
          COALESCE(
            SUM(provider_cost_micros),
            0
          ) AS provider_cost_micros,
          COALESCE(
            SUM(customer_charge_micros),
            0
          ) AS customer_charge_micros
        FROM usage_events
        WHERE tenant_id = ?
          AND created_at >= ?
          AND status = 'completed'
        GROUP BY
          provider,
          billing_mode
        `
      )
        .bind(
          auth.tenantId,
          since
        )
        .all();

    return c.json({
      summary,

      by_provider:
        byProvider.results,
    });
  }
);

/* -------------------------------------------------------------------------- */
/* CONVERSATIONS - LIST                                                       */
/* -------------------------------------------------------------------------- */

app.get(
  "/v1/conversations",
  async (c) => {
    const auth =
      await requireDashboard(c);

    if (!auth) {
      return jsonError(
        c,
        "UNAUTHORIZED",
        "Authentication required.",
        401
      );
    }

    const rows =
      await c.env.DB.prepare(
        `
        SELECT
          id,
          project_id,
          title,
          model,
          language,
          locale,
          created_at,
          updated_at
        FROM conversations
        WHERE tenant_id = ?
        ORDER BY updated_at DESC
        LIMIT 100
        `
      )
        .bind(auth.tenantId)
        .all();

    return c.json({
      conversations:
        rows.results,
    });
  }
);

/* -------------------------------------------------------------------------- */
/* CONVERSATIONS - DETAIL                                                     */
/* -------------------------------------------------------------------------- */

app.get(
  "/v1/conversations/:id",
  async (c) => {
    const auth =
      await requireDashboard(c);

    if (!auth) {
      return jsonError(
        c,
        "UNAUTHORIZED",
        "Authentication required.",
        401
      );
    }

    const conversationId =
      c.req.param("id");

    const conversation =
      await c.env.DB.prepare(
        `
        SELECT *
        FROM conversations
        WHERE id = ?
          AND tenant_id = ?
        `
      )
        .bind(
          conversationId,
          auth.tenantId
        )
        .first();

    if (!conversation) {
      return jsonError(
        c,
        "NOT_FOUND",
        "Conversation not found.",
        404
      );
    }

    const messages =
      await c.env.DB.prepare(
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
        .bind(
          conversationId
        )
        .all();

    return c.json({
      conversation,

      messages:
        messages.results,
    });
  }
);

/* -------------------------------------------------------------------------- */
/* EXPORT                                                                     */
/* -------------------------------------------------------------------------- */

export default app;