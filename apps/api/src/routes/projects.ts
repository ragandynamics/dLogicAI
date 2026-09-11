import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types";
import { id, now, jsonError } from "../utils/common";
import { bytesToHex, encryptText, sha256 } from "../utils/crypto";
import { requireDashboard } from "../utils/auth";
import {
  canManageTenantDevEnvironment,
  canManageTenantSecrets,
} from "../tenant-roles";

const router = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

router.get("/v1/projects", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

  const rows = await c.env.DB.prepare(
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
    projects: rows.results,
  });
});

router.post("/v1/projects", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

  if (!canManageTenantDevEnvironment(auth.role)) {
    return jsonError(
      c,
      "FORBIDDEN",
      "Tenant members with workspace access can manage the dev environment.",
      403
    );
  }

  const schema = z.object({
    name: z.string().min(1).max(100),
    environment: z
      .enum(["development", "staging", "production"])
      .default("production"),
  });

  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));

  if (!parsed.success) {
    return jsonError(c, "INVALID_REQUEST", "Invalid project.");
  }

  const subscription = await c.env.DB.prepare(
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

  const count = await c.env.DB.prepare(
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
    Number(count?.count || 0) >= Number(subscription.max_projects)
  ) {
    return jsonError(
      c,
      "PROJECT_LIMIT",
      "Your plan has reached its project limit.",
      402
    );
  }

  const projectId = id("prj");
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
});

router.post("/v1/projects/:projectId/api-keys", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

  const project = await c.env.DB.prepare(
    `
    SELECT id, environment
    FROM projects
    WHERE id = ?
      AND tenant_id = ?
    `
  )
    .bind(c.req.param("projectId"), auth.tenantId)
    .first<{
      id: string;
      environment: string;
    }>();

  if (!project) {
    return jsonError(c, "NOT_FOUND", "Project not found.", 404);
  }

  if (
    project.environment === "production" &&
    !canManageTenantSecrets(auth.role)
  ) {
    return jsonError(
      c,
      "FORBIDDEN",
      "Owner or admin access is required for production API keys.",
      403
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const name =
    typeof body.name === "string" ? body.name.trim().slice(0, 100) : "API key";

  const plan = await c.env.DB.prepare(
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

  const count = await c.env.DB.prepare(
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

  if (plan && Number(count?.count || 0) >= Number(plan.max_api_keys)) {
    return jsonError(
      c,
      "API_KEY_LIMIT",
      "Your plan has reached its API key limit.",
      402
    );
  }

  const secret = `sk_live_${bytesToHex(
    crypto.getRandomValues(new Uint8Array(24))
  )}`;
  const keyHash = await sha256(secret);
  const keyId = id("key");
  const prefix = secret.slice(0, 16);
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
    .bind(keyId, auth.tenantId, project.id, name, prefix, keyHash, t)
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
      warning: "Store this secret now. It will not be shown again.",
    },
    201
  );
});

router.get("/v1/projects/:projectId/api-keys", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

  const rows = await c.env.DB.prepare(
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
    .bind(auth.tenantId, c.req.param("projectId"))
    .all();

  return c.json({
    api_keys: rows.results,
  });
});

router.post("/v1/projects/:projectId/api-keys/:keyId/deactivate", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  const project = await c.env.DB.prepare(
    "SELECT environment FROM projects WHERE id=? AND tenant_id=?"
  )
    .bind(c.req.param("projectId"), auth.tenantId)
    .first<{ environment: string }>();
  if (!project) return jsonError(c, "NOT_FOUND", "Project not found.", 404);
  if (
    project.environment === "production" &&
    !canManageTenantSecrets(auth.role)
  ) {
    return jsonError(
      c,
      "FORBIDDEN",
      "Owner or admin access is required for production API keys.",
      403
    );
  }
  const result = await c.env.DB.prepare(
    `
    UPDATE api_keys SET status='revoked'
    WHERE id=? AND project_id=? AND tenant_id=? AND status='active'
  `
  )
    .bind(c.req.param("keyId"), c.req.param("projectId"), auth.tenantId)
    .run();
  if (!result.meta.changes) {
    return jsonError(c, "NOT_FOUND", "Active API key not found.", 404);
  }
  return c.json({ deactivated: true });
});

router.get("/v1/providers", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  const rows = await c.env.DB.prepare(
    `SELECT id, provider, name, status, created_at, updated_at
     FROM tenant_llm_credentials WHERE tenant_id = ? ORDER BY created_at DESC`
  )
    .bind(auth.tenantId)
    .all();
  return c.json({ providers: rows.results });
});

router.post("/v1/providers", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  if (!canManageTenantSecrets(auth.role)) {
    return jsonError(
      c,
      "FORBIDDEN",
      "Owner or admin access is required for tenant provider credentials.",
      403
    );
  }
  const parsed = z
    .object({
      provider: z.enum(["openai", "google"]),
      name: z.string().trim().min(1).max(80),
      api_key: z.string().min(10).max(1000),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(c, "INVALID_REQUEST", "Provider and API key are required.", 400);
  }

  const plan = await c.env.DB.prepare(
    `SELECT byok_enabled FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = ? LIMIT 1`
  )
    .bind(auth.tenantId)
    .first<{ byok_enabled: number }>();
  if (!plan?.byok_enabled) {
    return jsonError(
      c,
      "BYOK_NOT_INCLUDED",
      "Tenant LLM keys are not included in your plan.",
      402
    );
  }

  const encrypted = await encryptText(parsed.data.api_key, c.env.MASTER_KEY);
  const credentialId = id("tenant_cred");
  const timestamp = now();
  await c.env.DB.prepare(
    `INSERT INTO tenant_llm_credentials (id, tenant_id, provider, name, encrypted_credentials, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, provider) DO UPDATE SET name = excluded.name, encrypted_credentials = excluded.encrypted_credentials, status = 'active', updated_at = excluded.updated_at`
  )
    .bind(
      credentialId,
      auth.tenantId,
      parsed.data.provider,
      parsed.data.name,
      encrypted,
      timestamp,
      timestamp
    )
    .run();
  return c.json(
    {
      credential: {
        id: credentialId,
        provider: parsed.data.provider,
        name: parsed.data.name,
      },
    },
    201
  );
});

router.post("/v1/projects/:projectId/providers", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

  if (!canManageTenantSecrets(auth.role)) {
    return jsonError(
      c,
      "FORBIDDEN",
      "Owner or admin access is required for project provider credentials.",
      403
    );
  }

  const project = await c.env.DB.prepare(
    `
    SELECT id
    FROM projects
    WHERE id = ?
      AND tenant_id = ?
    `
  )
    .bind(c.req.param("projectId"), auth.tenantId)
    .first<{
      id: string;
    }>();

  if (!project) {
    return jsonError(c, "NOT_FOUND", "Project not found.", 404);
  }

  const plan = await c.env.DB.prepare(
    `
    SELECT byok_enabled, max_byok_credentials
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.tenant_id = ?
    LIMIT 1
    `
  )
    .bind(auth.tenantId)
    .first<{
      byok_enabled: number;
      max_byok_credentials: number;
    }>();

  if (!plan?.byok_enabled) {
    return jsonError(
      c,
      "BYOK_NOT_INCLUDED",
      "Bring-your-own provider keys are not included in your plan.",
      402
    );
  }

  const credentialCount = await c.env.DB.prepare(
    `
    SELECT COUNT(*) AS count
    FROM provider_credentials
    WHERE tenant_id = ?
      AND status = 'active'
    `
  )
    .bind(auth.tenantId)
    .first<{
      count: number;
    }>();

  if (
    Number(credentialCount?.count || 0) >=
    Number(plan.max_byok_credentials || 0)
  ) {
    return jsonError(
      c,
      "BYOK_CREDENTIAL_LIMIT",
      "Your plan has reached its BYOK credential limit.",
      402
    );
  }

  const schema = z.object({
    provider: z.enum(["openai", "google"]),
    name: z.string().min(1).max(80),
    api_key: z.string().min(10).max(1000),
  });

  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));

  if (!parsed.success) {
    return jsonError(
      c,
      "INVALID_REQUEST",
      "Provider and API key are required."
    );
  }

  const encrypted = await encryptText(parsed.data.api_key, c.env.MASTER_KEY);
  const credentialId = id("cred");
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
        provider: parsed.data.provider,
        name: parsed.data.name,
      },
    },
    201
  );
});

router.get("/v1/projects/:projectId/providers", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

  const rows = await c.env.DB.prepare(
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
    .bind(auth.tenantId, c.req.param("projectId"))
    .all();

  return c.json({
    providers: rows.results,
  });
});

export const projectRoutes = router;
