import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";

type Env = {
  DB: D1Database;
  SESSION_SECRET: string;
  MASTER_KEY: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
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

const app = new Hono<{ Bindings: Env; Variables: { auth?: AuthContext; apiProjectId?: string; apiKey?: string } }>();

app.use(
  "*",
  cors({
    origin: (origin) => origin || "*",
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.get("/health", (c) => c.json({ ok: true, service: "dLogicAI-api", version: "0.1.0" }));

/* -------------------------------------------------------------------------- */
/* HELPER FUNCTIONS                                                           */
/* -------------------------------------------------------------------------- */

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function now() {
  return Date.now();
}

function jsonError(c: any, code: string, message: string, status = 400) {
  return c.json({ error: { code, message } }, status);
}

function sessionCookie(c: any, sessionId: string, maxAge: number) {
  const isHttps = new URL(c.req.url).protocol === "https:";

  return [
    `dLogicAI_session=${encodeURIComponent(sessionId)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
    ...(isHttps ? ["Secure"] : []),
  ].join("; ");
}

function parseCookies(header: string | undefined) {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, key, 256);
  return `pbkdf2$150000$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, stored: string) {
  const [, iterations, saltHex, hashHex] = stored.split("$");
  const salt = hexToBytes(saltHex);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: Number(iterations), hash: "SHA-256" }, key, 256);
  const actual = new Uint8Array(bits);
  const expected = hexToBytes(hashHex);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

async function sha256(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

async function encryptText(plaintext: string, masterHex: string) {
  const keyBytes = hexToBytes(masterHex);
  if (keyBytes.length !== 32) throw new Error("MASTER_KEY must be 32 bytes hex");
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return `${bytesToHex(iv)}.${bytesToHex(new Uint8Array(ciphertext))}`;
}

async function decryptText(payload: string, masterHex: string) {
  const [ivHex, dataHex] = payload.split(".");
  const keyBytes = hexToBytes(masterHex);
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: hexToBytes(ivHex) }, key, hexToBytes(dataHex));
  return new TextDecoder().decode(plaintext);
}

function bearer(request: Request) {
  const h = request.headers.get("Authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

function extractText(input: unknown): string {
  if (typeof input === "string") return input;
  if (Array.isArray(input)) {
    return input
      .map((m: any) =>
        typeof m.content === "string"
          ? m.content
          : Array.isArray(m.content)
          ? m.content.map((x: any) => x.text || "").join("")
          : ""
      )
      .join("\n");
  }
  return "";
}

async function detectLanguage(text: string): Promise<string> {
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta";
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/[\u4E00-\u9FFF]/.test(text)) return "zh";
  if (/[\u3040-\u30FF]/.test(text)) return "ja";
  if (/[\uAC00-\uD7AF]/.test(text)) return "ko";
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  if (/[\u0400-\u04FF]/.test(text)) return "ru";
  if (/\b(el|la|los|las|que|cómo|como|por|para|una|un)\b/i.test(text)) return "es";
  if (/\b(le|les|des|une|comment|pour|avec)\b/i.test(text)) return "fr";
  return "en";
}

function modelPricing(provider: string, model: string) {
  if (provider === "openai") {
    if (model.includes("gpt-4o-mini") || model.includes("gpt-5-mini")) return { input: 0.15, output: 0.6 };
    return { input: 2.5, output: 10.0 };
  }
  if (provider === "google") {
    if (model.includes("flash")) return { input: 0.075, output: 0.3 };
    return { input: 1.25, output: 5.0 };
  }
  return { input: 0, output: 0 };
}

function costMicros(provider: string, model: string, inputTokens: number, outputTokens: number) {
  const p = modelPricing(provider, model);
  return Math.round(((inputTokens * p.input + outputTokens * p.output) / 1_000_000) * 1_000_000);
}

/* -------------------------------------------------------------------------- */
/* AUTHENTICATION MIDDLEWARE                                                  */
/* -------------------------------------------------------------------------- */

async function sessionAuth(c: any): Promise<AuthContext | null> {
  const cookies = parseCookies(c.req.header("Cookie"));
  const sid = cookies["dLogicAI_session"];
  if (!sid) return null;
  const row = (await c.env.DB.prepare(
    `
    SELECT s.user_id, m.tenant_id
    FROM sessions s
    JOIN memberships m ON m.user_id = s.user_id
    WHERE s.id = ? AND s.expires_at > ?
    ORDER BY m.created_at ASC LIMIT 1
  `
  )
    .bind(sid, now())
    .first()) as { user_id: string; tenant_id: string } | null;
  return row ? { userId: row.user_id, tenantId: row.tenant_id } : null;
}

async function apiKeyAuth(c: any): Promise<AuthContext | null> {
  const raw = bearer(c.req.raw);

  if (!raw || !raw.startsWith("sk_")) {
    return null;
  }

  const hash = await sha256(raw);

  const row = (await c.env.DB.prepare(
    `
    SELECT
      tenant_id AS tenantId,
      project_id AS projectId
    FROM api_keys
    WHERE key_hash = ? AND status = 'active'
    LIMIT 1
    `
  )
    .bind(hash)
    .first()) as {
      tenantId?: string;
      projectId?: string;
    } | null;

  if (!row) {
    return null;
  }

  if (!row.tenantId || !row.projectId) {
    console.error("API key record is missing tenant/project", {
      hasTenantId: Boolean(row.tenantId),
      hasProjectId: Boolean(row.projectId),
    });

    return null;
  }

  c.set("apiProjectId", row.projectId);
  c.set("apiKey", raw);

  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      "UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?"
    )
      .bind(now(), hash)
      .run()
  );

  return {
    userId: "api",
    tenantId: row.tenantId,
  };
}

async function requireDashboard(c: any): Promise<AuthContext | null> {
  const auth = await sessionAuth(c);
  if (!auth) return null;
  c.set("auth", auth);
  return auth;
}

async function requireApi(c: any): Promise<AuthContext | null> {
  const auth = await apiKeyAuth(c);
  if (!auth) return null;
  c.set("auth", auth);
  return auth;
}

/* -------------------------------------------------------------------------- */
/* USAGE & LLM CALL HELPERS                                                   */
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
): Promise<boolean> {
  if (!plan) return true;

  const result = await c.env.DB.prepare(
    `
    INSERT INTO usage_events (
      id, request_id, tenant_id, project_id, provider, model, billing_mode,
      status, request_count, input_language, output_language, input_tokens,
      output_tokens, total_tokens, provider_cost_micros, customer_charge_micros, created_at
    )
    SELECT
      ?, ?, ?, ?, ?, ?, ?, 'reserved', 1, ?, ?, 0, 0, 0, 0, 0, ?
    WHERE (
      SELECT COALESCE(SUM(request_count), 0)
      FROM usage_events
      WHERE tenant_id = ?
        AND created_at >= ?
        AND status IN ('reserved', 'completed')
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
      inputLanguage ?? null,
      outputLanguage ?? null,
      now(),
      c.get("auth").tenantId,
      plan.current_period_start ?? 0,
      Number(plan.included_requests ?? 0)
    )
    .run();

  return Number(result.meta?.changes || 0) === 1;
}

async function callOpenAI(
  env: Env,
  apiKey: string,
  model: string,
  input: unknown,
  responseLanguage?: string,
  stream = false
): Promise<ProviderResult> {
  const system =
    responseLanguage && responseLanguage !== "auto"
      ? `Respond in ${responseLanguage}. Preserve code, URLs, product names and identifiers unless translation is requested.`
      : "Respond in the user's language unless the user explicitly requests another language.";

  const messages = [
    { role: "system", content: system },
    ...(Array.isArray(input) ? input : [{ role: "user", content: String(input) }]),
  ];

  const payload: any = { model, messages, stream };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  if (stream) {
    return { provider: "openai", model, text: "", inputTokens: 0, outputTokens: 0, providerCostMicros: 0, stream: res.body! };
  }

  const data: any = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  const usage = data.usage || {};
  const inputTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;

  return {
    provider: "openai",
    model,
    text,
    inputTokens,
    outputTokens,
    providerCostMicros: costMicros("openai", model, inputTokens, outputTokens),
  };
}

async function callGemini(
  env: Env,
  apiKey: string,
  model: string,
  input: unknown,
  responseLanguage?: string,
  stream = false
): Promise<ProviderResult> {
  const system =
    responseLanguage && responseLanguage !== "auto"
      ? `Respond in ${responseLanguage}. Preserve code, URLs, product names and identifiers unless translation is requested.`
      : "Respond in the user's language unless the user explicitly requests another language.";

  const contents = Array.isArray(input)
    ? input.map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
      }))
    : [{ role: "user", parts: [{ text: String(input) }] }];

  const body = { systemInstruction: { parts: [{ text: system }] }, contents };
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${
    stream ? "streamGenerateContent" : "generateContent"
  }?key=${encodeURIComponent(apiKey)}${stream ? "&alt=sse" : ""}`;

  const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  if (stream) return { provider: "google", model, text: "", inputTokens: 0, outputTokens: 0, providerCostMicros: 0, stream: res.body! };

  const data: any = await res.json();
  const text = (data.candidates || []).flatMap((c: any) => c.content?.parts || []).map((p: any) => p.text || "").join("");
  const usage = data.usageMetadata || {};
  const inputTokens = usage.promptTokenCount || 0;
  const outputTokens = usage.candidatesTokenCount || 0;

  return {
    provider: "google",
    model,
    text,
    inputTokens,
    outputTokens,
    providerCostMicros: costMicros("google", model, inputTokens, outputTokens),
  };
}

async function resolveProvider(c: any, projectId: string, requestedProvider?: string) {
  const auth = c.get("auth") as AuthContext;
  const credential = requestedProvider
    ? ((await c.env.DB.prepare(
        "SELECT provider,encrypted_credentials FROM provider_credentials WHERE tenant_id=? AND project_id=? AND provider=? AND status='active' ORDER BY created_at DESC LIMIT 1"
      )
        .bind(auth.tenantId, projectId, requestedProvider)
        .first()) as any)
    : ((await c.env.DB.prepare(
        "SELECT provider,encrypted_credentials FROM provider_credentials WHERE tenant_id=? AND project_id=? AND status='active' ORDER BY created_at DESC LIMIT 1"
      )
        .bind(auth.tenantId, projectId)
        .first()) as any);

  if (credential) {
    return {
      mode: "byok",
      provider: credential.provider,
      apiKey: await decryptText(credential.encrypted_credentials, c.env.MASTER_KEY),
    };
  }

  return {
    mode: "managed",
    provider: requestedProvider || (c.env.OPENAI_API_KEY ? "openai" : "google"),
    apiKey: requestedProvider === "google" ? c.env.GEMINI_API_KEY : c.env.OPENAI_API_KEY,
  };
}

/* -------------------------------------------------------------------------- */
/* API ROUTES                                                                 */
/* -------------------------------------------------------------------------- */

app.post("/v1/auth/register", async (c) => {
  const schema = z.object({
    name: z.string().min(2).max(100),
    email: z.string().email().max(255),
    password: z.string().min(10).max(200),
  });
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(c, "INVALID_REQUEST", parsed.error.issues[0]?.message || "Invalid request.");
  const { name, email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(normalizedEmail).first();
  if (existing) return jsonError(c, "EMAIL_EXISTS", "An account with that email already exists.", 409);

  const userId = id("usr");
  const tenantId = id("ten");
  const membershipId = id("mem");
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${crypto.randomUUID().slice(0, 8)}`;
  const t = now();
  const passwordHash = await hashPassword(password);

  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO users (id,email,name,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(userId, normalizedEmail, name, passwordHash, t, t),
    c.env.DB.prepare("INSERT INTO tenants (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)").bind(tenantId, `${name}'s Workspace`, slug, t, t),
    c.env.DB.prepare("INSERT INTO memberships (id,tenant_id,user_id,role,created_at) VALUES (?,?,?,?,?)").bind(membershipId, tenantId, userId, "owner", t),
    c.env.DB.prepare("INSERT INTO subscriptions (id,tenant_id,plan_id,current_period_start,current_period_end,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").bind(id("sub"), tenantId, "plan_free", t, t + 30 * 86400000, t, t),
  ]);

  const sessionId = id("ses");
  await c.env.DB.prepare("INSERT INTO sessions (id,user_id,expires_at,created_at) VALUES (?,?,?,?)").bind(sessionId, userId, t + 30 * 86400000, t).run();
  c.header("Set-Cookie", sessionCookie(c, sessionId, 2592000));
  return c.json({ user: { id: userId, email: normalizedEmail, name }, tenant: { id: tenantId, name: `${name}'s Workspace` } }, 201);
});

app.post("/v1/auth/login", async (c) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(c, "INVALID_REQUEST", "Invalid email or password.");
  const row = (await c.env.DB.prepare("SELECT id,email,name,password_hash FROM users WHERE email = ?").bind(parsed.data.email.toLowerCase()).first()) as { id: string; email: string; name: string; password_hash: string } | null;
  if (!row || !(await verifyPassword(parsed.data.password, row.password_hash))) return jsonError(c, "INVALID_CREDENTIALS", "Invalid email or password.", 401);
  const membership = (await c.env.DB.prepare("SELECT tenant_id FROM memberships WHERE user_id = ? ORDER BY created_at ASC LIMIT 1").bind(row.id).first()) as { tenant_id: string } | null;
  if (!membership) return jsonError(c, "NO_TENANT", "No workspace is associated with this account.", 403);
  const sessionId = id("ses");
  const t = now();
  await c.env.DB.prepare("INSERT INTO sessions (id,user_id,expires_at,created_at) VALUES (?,?,?,?)").bind(sessionId, row.id, t + 30 * 86400000, t).run();
  c.header("Set-Cookie", sessionCookie(c, sessionId, 2592000));
  return c.json({ user: { id: row.id, email: row.email, name: row.name }, tenantId: membership.tenant_id });
});

app.post("/v1/auth/logout", async (c) => {
  const cookies = parseCookies(c.req.header("Cookie"));
  if (cookies.dLogicAI_session) await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(cookies.dLogicAI_session).run();
  c.header(
  "Set-Cookie",
  sessionCookie(c, "", 0)
);
  return c.json({ ok: true });
});

app.get("/v1/me", async (c) => {
  const auth = await sessionAuth(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  const user = await c.env.DB.prepare("SELECT id,email,name FROM users WHERE id = ?").bind(auth.userId).first();
  const tenant = await c.env.DB.prepare("SELECT id,name,slug,default_language FROM tenants WHERE id = ?").bind(auth.tenantId).first();
  const subscription = await c.env.DB.prepare(
    `
    SELECT s.status, p.name plan_name, p.monthly_price_cents, p.included_requests
    FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = ?
  `
  )
    .bind(auth.tenantId)
    .first();
  return c.json({ user, tenant, subscription });
});

app.get("/v1/projects", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) {
  return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
}
  const rows = await c.env.DB.prepare("SELECT id,name,environment,status,created_at,updated_at FROM projects WHERE tenant_id = ? ORDER BY created_at DESC").bind(auth.tenantId).all();
  return c.json({ projects: rows.results });
});

app.post("/v1/projects", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) {
  return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
}
  const schema = z.object({ name: z.string().min(1).max(100), environment: z.enum(["development", "staging", "production"]).default("production") });
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(c, "INVALID_REQUEST", "Invalid project.");
  const sub = (await c.env.DB.prepare(
    `
    SELECT p.max_projects FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.tenant_id=?
  `
  )
    .bind(auth.tenantId)
    .first()) as { max_projects: number } | null;
  const count = (await c.env.DB.prepare("SELECT COUNT(*) count FROM projects WHERE tenant_id=?").bind(auth.tenantId).first()) as { count: number } | null;
  if (sub && (count?.count || 0) >= sub.max_projects) return jsonError(c, "PROJECT_LIMIT", "Your plan has reached its project limit.", 402);
  const projectId = id("prj"),
    t = now();
  await c.env.DB.prepare("INSERT INTO projects (id,tenant_id,name,environment,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(projectId, auth.tenantId, parsed.data.name, parsed.data.environment, t, t).run();
  return c.json({ project: { id: projectId, ...parsed.data } }, 201);
});

app.post("/v1/projects/:projectId/api-keys", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) {
  return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
}
  const project = await c.env.DB.prepare("SELECT id FROM projects WHERE id=? AND tenant_id=?").bind(c.req.param("projectId"), auth.tenantId).first();
  if (!project) return jsonError(c, "NOT_FOUND", "Project not found.", 404);
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.slice(0, 100) : "API key";
  const plan = (await c.env.DB.prepare("SELECT p.max_api_keys FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.tenant_id=?").bind(auth.tenantId).first()) as { max_api_keys: number } | null;
  const count = (await c.env.DB.prepare("SELECT COUNT(*) count FROM api_keys WHERE tenant_id=? AND status='active'").bind(auth.tenantId).first()) as { count: number } | null;
  if (plan && (count?.count || 0) >= plan.max_api_keys) return jsonError(c, "API_KEY_LIMIT", "Your plan has reached its API key limit.", 402);
  const secret = `sk_live_${bytesToHex(crypto.getRandomValues(new Uint8Array(24)))}`;
  const keyHash = await sha256(secret);
  const keyId = id("key"),
    prefix = secret.slice(0, 16),
    t = now();
  await c.env.DB.prepare("INSERT INTO api_keys (id,tenant_id,project_id,name,key_prefix,key_hash,created_at) VALUES (?,?,?,?,?,?,?)").bind(keyId, auth.tenantId, project.id, name, prefix, keyHash, t).run();
  return c.json({ api_key: { id: keyId, name, prefix, secret, created_at: t }, warning: "Store this secret now. It will not be shown again." }, 201);
});

app.get("/v1/projects/:projectId/api-keys", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) {
  return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
}
  const rows = await c.env.DB.prepare("SELECT id,name,key_prefix,status,created_at,last_used_at FROM api_keys WHERE tenant_id=? AND project_id=? ORDER BY created_at DESC").bind(auth.tenantId, c.req.param("projectId")).all();
  return c.json({ api_keys: rows.results });
});

app.post("/v1/projects/:projectId/providers", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) {
  return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
}
  const project = await c.env.DB.prepare("SELECT id FROM projects WHERE id=? AND tenant_id=?").bind(c.req.param("projectId"), auth.tenantId).first();
  if (!project) return jsonError(c, "NOT_FOUND", "Project not found.", 404);
  const schema = z.object({ provider: z.enum(["openai", "google"]), name: z.string().min(1).max(80), api_key: z.string().min(10).max(1000) });
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(c, "INVALID_REQUEST", "Provider and API key are required.");
  const encrypted = await encryptText(parsed.data.api_key, c.env.MASTER_KEY);
  const credentialId = id("cred"),
    t = now();
  await c.env.DB.prepare(
    `
    INSERT INTO provider_credentials (id,tenant_id,project_id,provider,name,encrypted_credentials,created_at)
    VALUES (?,?,?,?,?,?,?)
  `
  )
    .bind(credentialId, auth.tenantId, project.id, parsed.data.provider, parsed.data.name, encrypted, t)
    .run();
  return c.json({ credential: { id: credentialId, provider: parsed.data.provider, name: parsed.data.name } }, 201);
});

app.get("/v1/projects/:projectId/providers", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) {
  return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
}
  const rows = await c.env.DB.prepare("SELECT id,provider,name,status,created_at,last_used_at FROM provider_credentials WHERE tenant_id=? AND project_id=? ORDER BY created_at DESC").bind(auth.tenantId, c.req.param("projectId")).all();
  return c.json({ providers: rows.results });
});

app.post("/v1/responses", async (c) => {
  const auth = await requireApi(c);

  if (!auth) {
    return jsonError(
      c,
      "INVALID_API_KEY",
      "A valid dLogicAI API key is required.",
      401
    );
  }

  if (!auth.tenantId) {
    console.error("Missing tenantId after API authentication", auth);
    return jsonError(c, "AUTH_CONTEXT_ERROR", "API key has no tenant.", 500);
  }

  const projectId = c.get("apiProjectId") as string;

  if (!projectId) {
    console.error("Missing projectId after API authentication", auth);
    return jsonError(c, "AUTH_CONTEXT_ERROR", "API key has no project.", 500);
  }
  const schema = z.object({
    model: z.string().default("auto"),
    provider: z.enum(["openai", "google"]).optional(),
    input: z.any(),
    conversation_id: z.string().optional(),
    language: z.string().default("auto"),
    response_language: z.string().default("auto"),
    locale: z.string().optional(),
    stream: z.boolean().default(false),
  });
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(c, "INVALID_REQUEST", "Invalid response request.");

  const plan = (await c.env.DB.prepare(
    `
    SELECT p.*, s.current_period_start FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.tenant_id=?
  `
  )
    .bind(auth.tenantId)
    .first()) as any;

  const textInput = extractText(parsed.data.input);
  const inputLanguage = parsed.data.language === "auto" ? await detectLanguage(textInput) : parsed.data.language;
  const resolved = await resolveProvider(c, projectId, parsed.data.provider);
  if (!resolved.apiKey) return jsonError(c, "NO_PROVIDER", "No AI provider is configured for this project.", 400);

  let model = parsed.data.model;
  if (model === "auto") {
    model = resolved.provider === "openai" ? "gpt-4o-mini" : "gemini-1.5-flash";
  }

  const requestId = id("req");
  const conversationId = parsed.data.conversation_id || id("conv");
  const t = now();
  const outputLanguage = parsed.data.response_language === "auto" ? inputLanguage : parsed.data.response_language;
  const locale = parsed.data.locale ?? null;

  // Reserve usage prior to calling LLM APIs
  const isReserved = await reserveUsage(c, plan, requestId, projectId, resolved.provider, model, resolved.mode, inputLanguage, outputLanguage);
  if (!isReserved) {
    return jsonError(c, "QUOTA_EXCEEDED", "Monthly API request quota exceeded.", 402);
  }

  try {
    const result =
      resolved.provider === "openai"
        ? await callOpenAI(c.env, resolved.apiKey, model, parsed.data.input, parsed.data.response_language, parsed.data.stream)
        : await callGemini(c.env, resolved.apiKey, model, parsed.data.input, parsed.data.response_language, parsed.data.stream);

    if (parsed.data.stream) {
      const providerStream = result.stream!;
      const reader = providerStream.getReader();
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "response.completed", request_id: requestId })}\n\n`));
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "response.provider_event", data: new TextDecoder().decode(value) })}\n\n`));
        },
        cancel() {
          reader.cancel();
        },
      });

      c.executionCtx.waitUntil(
        c.env.DB.prepare(
          `
          UPDATE usage_events 
          SET status = 'completed'
          WHERE request_id = ?
        `
        )
          .bind(requestId)
          .run()
      );
      return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
    }

    const byokFee = resolved.mode === "byok" ? Number(plan?.byok_request_fee_micros || 0) : 0;
    const customerCharge = resolved.mode === "byok" ? byokFee : Math.round(result.providerCostMicros * 1.35);

    await c.env.DB.batch([
      c.env.DB.prepare(
        `
        INSERT INTO conversations (id,tenant_id,project_id,title,model,language,locale,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, model=excluded.model, language=excluded.language, locale=excluded.locale
      `
      ).bind(conversationId, auth.tenantId, projectId, textInput.slice(0, 100), model, inputLanguage, locale, t, t),
      c.env.DB.prepare(
        `
        INSERT INTO messages (id,conversation_id,role,content,input_tokens,output_tokens,created_at)
        VALUES (?,?,?,?,?,?,?)
      `
      ).bind(id("msg"), conversationId, "user", textInput, result.inputTokens, result.outputTokens, t),
      c.env.DB.prepare(
        `
        INSERT INTO messages (id,conversation_id,role,content,input_tokens,output_tokens,created_at)
        VALUES (?,?,?,?,?,?,?)
      `
      ).bind(id("msg"), conversationId, "assistant", result.text, result.inputTokens, result.outputTokens, t),
      c.env.DB.prepare(
        `
        UPDATE usage_events 
        SET status = 'completed',
            input_tokens = ?,
            output_tokens = ?,
            total_tokens = ?,
            provider_cost_micros = ?,
            customer_charge_micros = ?
        WHERE request_id = ?
      `
      ).bind(result.inputTokens, result.outputTokens, result.inputTokens + result.outputTokens, result.providerCostMicros, customerCharge, requestId),
    ]);

    return c.json({
      id: requestId,
      conversation_id: conversationId,
      model,
      provider: resolved.provider,
      billing_mode: resolved.mode,
      output_text: result.text,
      language: { input: inputLanguage, output: outputLanguage, locale },
      usage: { input_tokens: result.inputTokens, output_tokens: result.outputTokens, total_tokens: result.inputTokens + result.outputTokens },
    });
  } catch (e: any) {
    console.error("RESPONSES_PROVIDER_ERROR", {
      requestId,
      provider: resolved.provider,
      model,
      error: e?.message || String(e),
    });

    return c.json(
      {
        error: {
          code: "PROVIDER_ERROR",
          message: e?.message || "AI provider request failed.",
        },
      },
      502
    );
  }
});

app.get("/v1/usage", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) {
  return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
}
  const days = Math.min(Number(c.req.query("days") || 30), 365);
  const since = now() - days * 86400000;
  const summary = await c.env.DB.prepare(
    `
    SELECT COUNT(*) requests,
           COALESCE(SUM(input_tokens),0) input_tokens,
           COALESCE(SUM(output_tokens),0) output_tokens,
           COALESCE(SUM(provider_cost_micros),0) provider_cost_micros,
           COALESCE(SUM(customer_charge_micros),0) customer_charge_micros
    FROM usage_events WHERE tenant_id=? AND created_at>=?
  `
  )
    .bind(auth.tenantId, since)
    .first();
  const byProvider = await c.env.DB.prepare(
    `
    SELECT provider,billing_mode,COUNT(*) requests,COALESCE(SUM(provider_cost_micros),0) provider_cost_micros,COALESCE(SUM(customer_charge_micros),0) customer_charge_micros
    FROM usage_events WHERE tenant_id=? AND created_at>=? GROUP BY provider,billing_mode
  `
  )
    .bind(auth.tenantId, since)
    .all();
  return c.json({ summary, by_provider: byProvider.results });
});

app.get("/v1/conversations", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) {
  return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
}
  const rows = await c.env.DB.prepare(
    `
    SELECT id,project_id,title,model,language,locale,created_at,updated_at
    FROM conversations WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 100
  `
  )
    .bind(auth.tenantId)
    .all();
  return c.json({ conversations: rows.results });
});

app.get("/v1/conversations/:id", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) {
  return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
}
  const conv = await c.env.DB.prepare("SELECT * FROM conversations WHERE id=? AND tenant_id=?").bind(c.req.param("id"), auth.tenantId).first();
  if (!conv) return jsonError(c, "NOT_FOUND", "Conversation not found.", 404);
  const messages = await c.env.DB.prepare("SELECT id,role,content,input_tokens,output_tokens,created_at FROM messages WHERE conversation_id=? ORDER BY created_at ASC").bind(c.req.param("id")).all();
  return c.json({ conversation: conv, messages: messages.results });
});

export default app;