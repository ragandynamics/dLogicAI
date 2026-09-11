import type { AppContext, AuthContext } from "../types";
import { parseCookies, bearer, now } from "./common";
import { sha256 } from "./crypto";

export async function sessionAuth(c: AppContext): Promise<AuthContext | null> {
  const cookies = parseCookies(c.req.header("Cookie"));
  const sessionId = cookies["dlogicai_session"];

  if (!sessionId) {
    return null;
  }

  const row = await c.env.DB.prepare(
    `
    SELECT
      s.user_id,
      s.tenant_id,
      m.role
    FROM sessions s
    JOIN memberships m
      ON m.user_id = s.user_id
      AND m.tenant_id = s.tenant_id
    WHERE s.id = ?
      AND s.expires_at > ?
    LIMIT 1
    `
  )
    .bind(sessionId, now())
    .first<{
      user_id: string;
      tenant_id: string;
      role: string;
    }>();

  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    tenantId: row.tenant_id,
    role: row.role,
  };
}

export async function apiKeyAuth(c: AppContext): Promise<AuthContext | null> {
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
    console.error("API key missing tenant/project");
    return null;
  }

  c.set("apiProjectId", row.project_id);
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
    role: "api",
  };
}

export async function requireDashboard(c: AppContext): Promise<AuthContext | null> {
  const auth = await sessionAuth(c);

  if (!auth) {
    return null;
  }

  c.set("auth", auth);

  return auth;
}

export async function requireApi(c: AppContext): Promise<AuthContext | null> {
  const auth = await apiKeyAuth(c);

  if (!auth) {
    return null;
  }

  c.set("auth", auth);

  return auth;
}
