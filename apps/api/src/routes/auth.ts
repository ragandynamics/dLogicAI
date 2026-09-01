import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types";
import {
  id,
  now,
  jsonError,
  sessionCookie,
  parseCookies,
  appUrl,
  sendEmail,
} from "../utils/common";
import {
  bytesToHex,
  base32,
  createToken,
  encryptText,
  decryptText,
  hashPassword,
  verifyPassword,
  passwordSchema,
  sha256,
  totpCode,
  verifyTotp,
} from "../utils/crypto";
import { requireDashboard, sessionAuth } from "../utils/auth";
import { createCreditAccount } from "../services/credits";
import { normalizeTenantRole } from "../tenant-roles";

const router = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

router.post("/v1/auth/register", async (c) => {
  const schema = z.object({
    name: z.string().min(2).max(100),
    company_name: z.string().trim().max(160).optional().default(""),
    country: z.string().trim().max(100).optional().default(""),
    email: z.string().email().max(255),
    password: passwordSchema,
  });

  let body: unknown;
  try {
    body = await c.req.json();
  } catch (error) {
    console.error("REGISTER_JSON_PARSE_ERROR", {
      error: error instanceof Error ? error.message : String(error),
      contentType: c.req.header("content-type"),
    });

    return jsonError(
      c,
      "INVALID_JSON",
      "Request body must be valid JSON.",
      400
    );
  }

  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      c,
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message || "Invalid request."
    );
  }

  const { name, company_name, country, email, password } = parsed.data;

  const normalizedEmail = email.trim().toLowerCase();

  const existing = await c.env.DB.prepare(
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

  const userId = id("usr");
  const tenantId = id("ten");
  const membershipId = id("mem");

  const workspaceName =
    company_name && company_name.trim().length > 0
      ? company_name.trim()
      : `${name}'s Workspace`;

  const slug = `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-${crypto.randomUUID().slice(0, 8)}`;

  const t = now();
  const passwordHash = await hashPassword(password);

  const freePlan = await c.env.DB.prepare(
    "SELECT included_ai_credit_micros FROM plans WHERE id = ?"
  )
    .bind("plan_free")
    .first<{ included_ai_credit_micros: number }>();

  const initialCredits = Math.max(
    Number(freePlan?.included_ai_credit_micros || 0),
    0
  );

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
    ).bind(userId, normalizedEmail, name, passwordHash, t, t),

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
    ).bind(tenantId, workspaceName, slug, t, t),

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
    ).bind(membershipId, tenantId, userId, "owner", t),

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
    ).bind(id("sub"), tenantId, "plan_free", t, t + 30 * 86400000, t, t),
  ]);

  if (initialCredits > 0) {
    await createCreditAccount(c, tenantId, initialCredits);
  }

  const sessionId = id("ses");

  await c.env.DB.prepare(
    `
    INSERT INTO sessions (
      id,
      user_id,
      tenant_id,
      expires_at,
      created_at
    )
    VALUES (?,?,?,?,?)
    `
  )
    .bind(sessionId, userId, tenantId, t + 30 * 86400000, t)
    .run();

  c.header("Set-Cookie", sessionCookie(c, sessionId, 2592000));

  const verificationToken = await createToken();
  await c.env.DB.prepare(
    `
    INSERT INTO email_verification_tokens
      (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
    `
  )
    .bind(id("evt"), userId, verificationToken.hash, t + 86400000, t)
    .run();

  c.executionCtx.waitUntil(
    sendEmail(
      c,
      normalizedEmail,
      "Verify your dLogicAI email",
      `<p>Welcome to dLogicAI.</p><p><a href="${appUrl(
        c,
        `/v1/auth/email/verify?token=${encodeURIComponent(
          verificationToken.value
        )}`
      )}">Verify your email address</a></p><p>This link expires in 24 hours.</p>`
    )
  );

  return c.json(
    {
      user: {
        id: userId,
        email: normalizedEmail,
        name,
      },
      tenant: {
        id: tenantId,
        name: workspaceName,
      },
    },
    201
  );
});

router.post("/v1/auth/email/verification", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email) {
    const user = await c.env.DB.prepare(
      "SELECT id, email FROM users WHERE email = ? AND status = 'active'"
    )
      .bind(email)
      .first<{ id: string; email: string }>();
    if (user) {
      const token = await createToken();
      const t = now();
      await c.env.DB.batch([
        c.env.DB.prepare(
          "UPDATE email_verification_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL"
        ).bind(t, user.id),
        c.env.DB.prepare(
          "INSERT INTO email_verification_tokens (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)"
        ).bind(id("evt"), user.id, token.hash, t + 86400000, t),
      ]);
      c.executionCtx.waitUntil(
        sendEmail(
          c,
          user.email,
          "Verify your dLogicAI email",
          `<p><a href="${appUrl(
            c,
            `/v1/auth/email/verify?token=${encodeURIComponent(token.value)}`
          )}">Verify your email address</a></p>`
        )
      );
    }
  }
  return c.json({ accepted: true });
});

router.get("/v1/auth/email/verify", async (c) => {
  const token = c.req.query("token") || "";
  const tokenHash = await sha256(token);
  const row = await c.env.DB.prepare(
    `SELECT id, user_id FROM email_verification_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>?`
  )
    .bind(tokenHash, now())
    .first<{ id: string; user_id: string }>();
  if (!row) {
    return jsonError(
      c,
      "INVALID_VERIFICATION_TOKEN",
      "This verification link is invalid or expired.",
      400
    );
  }
  const t = now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE users SET email_verified_at=?, updated_at=? WHERE id=?"
    ).bind(t, t, row.user_id),
    c.env.DB.prepare(
      "UPDATE email_verification_tokens SET used_at=? WHERE id=?"
    ).bind(t, row.id),
  ]);
  return c.json({ verified: true });
});

router.post("/v1/auth/password/forgot", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email) {
    const user = await c.env.DB.prepare(
      "SELECT id, email FROM users WHERE email = ? AND status = 'active'"
    )
      .bind(email)
      .first<{ id: string; email: string }>();
    if (user) {
      const token = await createToken();
      const t = now();
      await c.env.DB.batch([
        c.env.DB.prepare(
          "UPDATE password_reset_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL"
        ).bind(t, user.id),
        c.env.DB.prepare(
          "INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)"
        ).bind(id("prt"), user.id, token.hash, t + 3600000, t),
      ]);
      c.executionCtx.waitUntil(
        sendEmail(
          c,
          user.email,
          "Reset your dLogicAI password",
          `<p><a href="${appUrl(
            c,
            `/reset-password?token=${encodeURIComponent(token.value)}`
          )}">Reset your password</a></p><p>This link expires in one hour.</p>`
        )
      );
    }
  }
  return c.json({ accepted: true });
});

router.post("/v1/auth/password/reset", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = z
    .object({ token: z.string().min(1), password: passwordSchema })
    .safeParse(body);
  if (!parsed.success) {
    return jsonError(
      c,
      "INVALID_REQUEST",
      "A valid reset token and password are required."
    );
  }
  const tokenHash = await sha256(parsed.data.token);
  const row = await c.env.DB.prepare(
    "SELECT id, user_id FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>?"
  )
    .bind(tokenHash, now())
    .first<{ id: string; user_id: string }>();
  if (!row) {
    return jsonError(
      c,
      "INVALID_RESET_TOKEN",
      "This reset link is invalid or expired.",
      400
    );
  }
  const t = now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE users SET password_hash=?, updated_at=? WHERE id=?"
    ).bind(await hashPassword(parsed.data.password), t, row.user_id),
    c.env.DB.prepare(
      "UPDATE password_reset_tokens SET used_at=? WHERE id=?"
    ).bind(t, row.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(row.user_id),
  ]);
  return c.json({ reset: true });
});

router.get("/v1/auth/2fa", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  const row = await c.env.DB.prepare(
    "SELECT enabled_at FROM totp_credentials WHERE user_id=?"
  )
    .bind(auth.userId)
    .first<{ enabled_at: number | null }>();
  return c.json({
    enabled: Boolean(row?.enabled_at),
    pending: Boolean(row && !row.enabled_at),
  });
});

router.post("/v1/auth/2fa/enroll", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  const user = await c.env.DB.prepare(
    "SELECT email FROM users WHERE id=? AND status='active'"
  )
    .bind(auth.userId)
    .first<{ email: string }>();
  if (!user) return jsonError(c, "NOT_FOUND", "User not found.", 404);
  const secret = base32(crypto.getRandomValues(new Uint8Array(20)));
  const encrypted = await encryptText(secret, c.env.MASTER_KEY);
  const t = now();
  await c.env.DB.prepare(
    `INSERT INTO totp_credentials (user_id, encrypted_secret, enabled_at, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET encrypted_secret=excluded.encrypted_secret, enabled_at=NULL, updated_at=excluded.updated_at`
  )
    .bind(auth.userId, encrypted, t, t)
    .run();
  const label = encodeURIComponent(`dLogicAI:${user.email}`);
  return c.json({
    secret,
    otpauth_url: `otpauth://totp/${label}?secret=${secret}&issuer=dLogicAI&algorithm=SHA1&digits=6&period=30`,
  });
});

router.post("/v1/auth/2fa/confirm", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  const body = await c.req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const row = await c.env.DB.prepare(
    "SELECT encrypted_secret FROM totp_credentials WHERE user_id=? AND enabled_at IS NULL"
  )
    .bind(auth.userId)
    .first<{ encrypted_secret: string }>();
  if (
    !row ||
    !/^\d{6}$/.test(code) ||
    !(await verifyTotp(
      await decryptText(row.encrypted_secret, c.env.MASTER_KEY),
      code
    ))
  ) {
    return jsonError(
      c,
      "INVALID_2FA_CODE",
      "The authentication code is invalid.",
      400
    );
  }
  await c.env.DB.prepare(
    "UPDATE totp_credentials SET enabled_at=?, updated_at=? WHERE user_id=?"
  )
    .bind(now(), now(), auth.userId)
    .run();
  return c.json({ enabled: true });
});

router.post("/v1/auth/2fa/disable", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  const body = await c.req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const row = await c.env.DB.prepare(
    "SELECT encrypted_secret FROM totp_credentials WHERE user_id=? AND enabled_at IS NOT NULL"
  )
    .bind(auth.userId)
    .first<{ encrypted_secret: string }>();
  if (
    !row ||
    !/^\d{6}$/.test(code) ||
    !(await verifyTotp(
      await decryptText(row.encrypted_secret, c.env.MASTER_KEY),
      code
    ))
  ) {
    return jsonError(
      c,
      "INVALID_2FA_CODE",
      "The authentication code is invalid.",
      400
    );
  }
  await c.env.DB.prepare(
    "DELETE FROM totp_credentials WHERE user_id=?"
  )
    .bind(auth.userId)
    .run();
  return c.json({ enabled: false });
});

router.post("/v1/auth/login", async (c) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    tenant_id: z.string().trim().min(1).optional(),
  });

  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));

  if (!parsed.success) {
    return jsonError(c, "INVALID_REQUEST", "Invalid email or password.");
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();

  const row = await c.env.DB.prepare(
    `
    SELECT
      id,
      email,
      name,
      password_hash
    FROM users
    WHERE email = ?
      AND status = 'active'
    `
  )
    .bind(normalizedEmail)
    .first<{
      id: string;
      email: string;
      name: string;
      password_hash: string;
    }>();

  if (!row || !(await verifyPassword(parsed.data.password, row.password_hash))) {
    return jsonError(
      c,
      "INVALID_CREDENTIALS",
      "Invalid email or password.",
      401
    );
  }

  const memberships = await c.env.DB.prepare(
    "SELECT tenant_id, role FROM memberships WHERE user_id = ? ORDER BY created_at ASC"
  )
    .bind(row.id)
    .all<{ tenant_id: string; role: string }>();
  if (!memberships.results.length) {
    return jsonError(
      c,
      "NO_TENANT",
      "No workspace is associated with this account.",
      403
    );
  }

  const requestedTenantId = parsed.data.tenant_id;
  const membership = requestedTenantId
    ? memberships.results.find(
        (candidate) => candidate.tenant_id === requestedTenantId
      )
    : memberships.results.length === 1
      ? memberships.results[0]
      : null;
  if (!membership) {
    return c.json(
      {
        error: {
          code: "TENANT_SELECTION_REQUIRED",
          message: "Select a workspace before signing in.",
        },
        memberships: memberships.results,
      },
      409
    );
  }

  const twoFactor = await c.env.DB.prepare(
    "SELECT user_id FROM totp_credentials WHERE user_id=? AND enabled_at IS NOT NULL"
  )
    .bind(row.id)
    .first<{ user_id: string }>();

  if (twoFactor) {
    const challenge = await createToken();
    const challengeExpiry = now() + 300000;
    await c.env.DB.prepare(
      "INSERT INTO login_challenges (id,user_id,tenant_id,challenge_hash,expires_at,created_at) VALUES (?,?,?,?,?,?)"
    )
      .bind(
        id("lch"),
        row.id,
        membership.tenant_id,
        challenge.hash,
        challengeExpiry,
        now()
      )
      .run();
    return c.json(
      {
        error: {
          code: "TWO_FACTOR_REQUIRED",
          message: "Enter the authentication code from your app.",
        },
        challenge: challenge.value,
        expires_at: challengeExpiry,
      },
      401
    );
  }

  const sessionId = id("ses");
  const t = now();

  await c.env.DB.prepare(
    `
    INSERT INTO sessions (
      id,
      user_id,
      tenant_id,
      expires_at,
      created_at
    )
    VALUES (?,?,?,?,?)
    `
  )
    .bind(sessionId, row.id, membership.tenant_id, t + 30 * 86400000, t)
    .run();

  c.header("Set-Cookie", sessionCookie(c, sessionId, 2592000));

  return c.json({
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
    },
    tenantId: membership.tenant_id,
  });
});

router.post("/v1/auth/login/2fa", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const challenge = typeof body.challenge === "string" ? body.challenge : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!challenge || !/^\d{6}$/.test(code)) {
    return jsonError(
      c,
      "INVALID_2FA_CODE",
      "The authentication challenge or code is invalid.",
      401
    );
  }

  const row = await c.env.DB.prepare(
    `SELECT l.id, l.user_id, l.tenant_id, u.email, u.name, t.encrypted_secret
     FROM login_challenges l
     JOIN users u ON u.id=l.user_id AND u.status='active'
     JOIN totp_credentials t ON t.user_id=l.user_id AND t.enabled_at IS NOT NULL
     WHERE l.challenge_hash=? AND l.used_at IS NULL AND l.expires_at>?`
  )
    .bind(await sha256(challenge), now())
    .first<{
      id: string;
      user_id: string;
      tenant_id: string | null;
      email: string;
      name: string;
      encrypted_secret: string;
    }>();
  if (
    !row ||
    !(await verifyTotp(
      await decryptText(row.encrypted_secret, c.env.MASTER_KEY),
      code
    ))
  ) {
    return jsonError(
      c,
      "INVALID_2FA_CODE",
      "The authentication challenge or code is invalid.",
      401
    );
  }

  const membership = row.tenant_id
    ? await c.env.DB.prepare(
        "SELECT tenant_id, role FROM memberships WHERE user_id=? AND tenant_id=?"
      )
        .bind(row.user_id, row.tenant_id)
        .first<{ tenant_id: string; role: string }>()
    : await c.env.DB.prepare(
        "SELECT tenant_id, role FROM memberships WHERE user_id=? ORDER BY created_at ASC LIMIT 1"
      )
        .bind(row.user_id)
        .first<{ tenant_id: string; role: string }>();
  if (!membership) {
    return jsonError(
      c,
      "NO_TENANT",
      "No workspace is associated with this account.",
      403
    );
  }

  const sessionId = id("ses");
  const t = now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE login_challenges SET used_at=? WHERE id=?"
    ).bind(t, row.id),
    c.env.DB.prepare(
      "INSERT INTO sessions (id,user_id,tenant_id,expires_at,created_at) VALUES (?,?,?,?,?)"
    ).bind(sessionId, row.user_id, membership.tenant_id, t + 30 * 86400000, t),
  ]);
  c.header("Set-Cookie", sessionCookie(c, sessionId, 2592000));
  return c.json({
    user: { id: row.user_id, email: row.email, name: row.name },
    tenantId: membership.tenant_id,
  });
});

router.post("/v1/auth/logout", async (c) => {
  const cookies = parseCookies(c.req.header("Cookie"));
  const sessionId = cookies["dlogicai_session"];

  if (sessionId) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?")
      .bind(sessionId)
      .run();
  }

  c.header("Set-Cookie", sessionCookie(c, "", 0));

  return c.json({
    ok: true,
  });
});

router.post("/v1/account/deactivate", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  const body = await c.req.json().catch(() => ({}));
  if (body.confirmation !== "DEACTIVATE") {
    return jsonError(
      c,
      "CONFIRMATION_REQUIRED",
      "Type DEACTIVATE to confirm account deactivation.",
      400
    );
  }

  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE users SET status='inactive', updated_at=? WHERE id=?"
    ).bind(now(), auth.userId),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(auth.userId),
  ]);
  c.header("Set-Cookie", sessionCookie(c, "", 0));
  return c.json({ deactivated: true });
});

router.get("/v1/me", async (c) => {
  const auth = await sessionAuth(c);

  if (!auth) {
    return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  }

  const user = await c.env.DB.prepare(
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

  const tenant = await c.env.DB.prepare(
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

  const memberships = await c.env.DB.prepare(
    `SELECT m.tenant_id, m.role, t.name, t.slug
     FROM memberships m JOIN tenants t ON t.id = m.tenant_id
     WHERE m.user_id = ? ORDER BY m.created_at ASC`
  )
    .bind(auth.userId)
    .all();

  const subscription = await c.env.DB.prepare(
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
    role: normalizeTenantRole(auth.role),
    memberships: memberships.results,
    subscription,
  });
});

router.post("/v1/auth/tenant", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  const parsed = z
    .object({ tenant_id: z.string().trim().min(1) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(c, "INVALID_REQUEST", "A tenant_id is required.", 400);
  }

  const membership = await c.env.DB.prepare(
    "SELECT role FROM memberships WHERE user_id = ? AND tenant_id = ?"
  )
    .bind(auth.userId, parsed.data.tenant_id)
    .first<{ role: string }>();
  if (!membership) {
    return jsonError(
      c,
      "FORBIDDEN",
      "You are not a member of that workspace.",
      403
    );
  }

  const sessionId = parseCookies(c.req.header("Cookie"))["dlogicai_session"];
  if (!sessionId) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  await c.env.DB.prepare(
    "UPDATE sessions SET tenant_id = ? WHERE id = ? AND user_id = ?"
  )
    .bind(parsed.data.tenant_id, sessionId, auth.userId)
    .run();

  return c.json({
    tenantId: parsed.data.tenant_id,
    role: normalizeTenantRole(membership.role),
  });
});

export const authRoutes = router;
