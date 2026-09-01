import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types";
import { id, now, jsonError } from "../utils/common";
import { encryptText, decryptText } from "../utils/crypto";
import { requireDashboard } from "../utils/auth";
import {
  canManageTenantSecrets,
  canManageTenantServices,
} from "../tenant-roles";
import { getOwnedProject } from "../services/channels";
import {
  commerceConnectors,
  type CommerceConnectorKey,
  type ConnectorOperation,
} from "../connectors";

const router = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

router.get("/v1/projects/:projectId/connectors", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  const project = await getOwnedProject(
    c,
    c.req.param("projectId"),
    auth.tenantId
  );
  if (!project) return jsonError(c, "NOT_FOUND", "Project not found.", 404);
  const connectors = await c.env.DB.prepare(
    `SELECT i.id, i.name, i.environment, i.status, i.last_tested_at, i.last_error_code,
            c.key, c.name AS connector_name, c.description
     FROM connector_installations i JOIN connector_catalog c ON c.id = i.connector_id
     WHERE i.tenant_id = ? AND i.project_id = ? ORDER BY i.created_at DESC`
  )
    .bind(auth.tenantId, project.id)
    .all();
  return c.json({ connectors: connectors.results });
});

router.post("/v1/projects/:projectId/connectors", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  if (!canManageTenantServices(auth.role)) {
    return jsonError(
      c,
      "FORBIDDEN",
      "Tenant workspace access is required.",
      403
    );
  }
  const project = await getOwnedProject(
    c,
    c.req.param("projectId"),
    auth.tenantId
  );
  if (!project) return jsonError(c, "NOT_FOUND", "Project not found.", 404);
  if (
    project.environment === "production" &&
    !canManageTenantSecrets(auth.role)
  ) {
    return jsonError(
      c,
      "FORBIDDEN",
      "Owner or admin access is required for production connectors.",
      403
    );
  }
  const parsed = z
    .object({
      connector_key: z.enum(["amazon", "shopee", "lazada", "tiktok_shop"]),
      name: z.string().trim().min(1).max(100),
      credentials: z
        .record(z.string(), z.string())
        .refine(
          (value) => Object.keys(value).length > 0,
          "Connector credentials are required."
        ),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(
      c,
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message || "Invalid connector configuration.",
      400
    );
  }
  const connector = commerceConnectors.get(parsed.data.connector_key);
  if (!connector) {
    return jsonError(c, "CONNECTOR_NOT_FOUND", "Connector is not available.", 404);
  }
  const credentialError = connector.validateCredentials(
    parsed.data.credentials
  );
  if (credentialError) {
    return jsonError(c, credentialError, "Connector credentials are required.", 400);
  }
  const catalog = await c.env.DB.prepare(
    "SELECT id FROM connector_catalog WHERE key = ? AND active = 1"
  )
    .bind(parsed.data.connector_key)
    .first<{ id: string }>();
  if (!catalog) {
    return jsonError(c, "CONNECTOR_NOT_FOUND", "Connector is not available.", 404);
  }
  const installationId = id("connector");
  const timestamp = now();
  try {
    await c.env.DB.prepare(
      `INSERT INTO connector_installations
       (id, tenant_id, project_id, connector_id, environment, name, encrypted_credentials, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        installationId,
        auth.tenantId,
        project.id,
        catalog.id,
        project.environment,
        parsed.data.name,
        await encryptText(
          JSON.stringify(parsed.data.credentials),
          c.env.MASTER_KEY
        ),
        timestamp,
        timestamp
      )
      .run();
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      return jsonError(
        c,
        "ALREADY_EXISTS",
        "A connector with this name already exists in the project.",
        409
      );
    }
    throw error;
  }
  return c.json(
    {
      connector: {
        id: installationId,
        key: parsed.data.connector_key,
        name: parsed.data.name,
        environment: project.environment,
        status: "configured",
        created_at: timestamp,
      },
    },
    201
  );
});

router.post(
  "/v1/projects/:projectId/connectors/:installationId/test",
  async (c) => {
    const auth = await requireDashboard(c);
    if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
    const installation = await c.env.DB.prepare(
      `SELECT i.id, i.connector_id, i.environment, c.key
     FROM connector_installations i JOIN connector_catalog c ON c.id = i.connector_id
     WHERE i.id = ? AND i.project_id = ? AND i.tenant_id = ?`
    )
      .bind(
        c.req.param("installationId"),
        c.req.param("projectId"),
        auth.tenantId
      )
      .first<{
        id: string;
        connector_id: string;
        environment: string;
        key: CommerceConnectorKey;
      }>();
    if (!installation) {
      return jsonError(c, "NOT_FOUND", "Connector installation not found.", 404);
    }
    const connector = commerceConnectors.get(installation.key);
    if (!connector) {
      return jsonError(c, "CONNECTOR_NOT_FOUND", "Connector is not available.", 404);
    }
    const credentialsRow = await c.env.DB.prepare(
      "SELECT encrypted_credentials FROM connector_installations WHERE id = ? AND tenant_id = ?"
    )
      .bind(installation.id, auth.tenantId)
      .first<{ encrypted_credentials: string }>();
    try {
      const credentials = JSON.parse(
        await decryptText(
          credentialsRow!.encrypted_credentials,
          c.env.MASTER_KEY
        )
      ) as Record<string, string>;
      const errorCode = connector.validateCredentials(credentials);
      const status = errorCode ? "error" : "configured";
      await c.env.DB.prepare(
        "UPDATE connector_installations SET status = ?, last_tested_at = ?, last_error_code = ?, updated_at = ? WHERE id = ? AND tenant_id = ?"
      )
        .bind(
          status,
          now(),
          errorCode,
          now(),
          installation.id,
          auth.tenantId
        )
        .run();
      return c.json({
        ok: !errorCode,
        status,
        environment: installation.environment,
        error_code: errorCode,
      });
    } catch {
      await c.env.DB.prepare(
        "UPDATE connector_installations SET status = 'error', last_tested_at = ?, last_error_code = ?, updated_at = ? WHERE id = ? AND tenant_id = ?"
      )
        .bind(
          now(),
          "CREDENTIAL_DECRYPTION_FAILED",
          now(),
          installation.id,
          auth.tenantId
        )
        .run();
      return jsonError(
        c,
        "CONNECTOR_CONFIGURATION_ERROR",
        "Connector credentials could not be verified.",
        503
      );
    }
  }
);

router.post(
  "/v1/projects/:projectId/connectors/:installationId/execute",
  async (c) => {
    const auth = await requireDashboard(c);
    if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
    const parsed = z
      .object({
        operation: z.enum([
          "get_order",
          "get_order_items",
          "get_product",
          "get_inventory",
          "get_shipment",
          "get_return",
          "get_refund",
        ]),
        input: z.record(z.string(), z.unknown()).default({}),
      })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonError(
        c,
        "INVALID_REQUEST",
        "A supported connector operation is required.",
        400
      );
    }
    const installation = await c.env.DB.prepare(
      `SELECT i.id, i.connector_id, i.environment, c.key, i.encrypted_credentials
     FROM connector_installations i JOIN connector_catalog c ON c.id = i.connector_id
     WHERE i.id = ? AND i.project_id = ? AND i.tenant_id = ? AND i.status != 'disabled'`
    )
      .bind(
        c.req.param("installationId"),
        c.req.param("projectId"),
        auth.tenantId
      )
      .first<{
        id: string;
        connector_id: string;
        environment: string;
        key: CommerceConnectorKey;
        encrypted_credentials: string;
      }>();
    if (!installation) {
      return jsonError(c, "NOT_FOUND", "Connector installation not found.", 404);
    }
    const connector = commerceConnectors.get(installation.key);
    if (!connector) {
      return jsonError(c, "CONNECTOR_NOT_FOUND", "Connector is not available.", 404);
    }
    const eventId = id("cevent");
    const timestamp = now();
    await c.env.DB.prepare(
      "INSERT INTO connector_events (id, tenant_id, project_id, installation_id, operation, request_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        eventId,
        auth.tenantId,
        c.req.param("projectId"),
        installation.id,
        parsed.data.operation,
        JSON.stringify(parsed.data.input),
        timestamp
      )
      .run();
    const credentials = JSON.parse(
      await decryptText(installation.encrypted_credentials, c.env.MASTER_KEY)
    ) as Record<string, string>;
    const result = await connector.execute(
      parsed.data.operation as ConnectorOperation,
      parsed.data.input,
      credentials
    );
    await c.env.DB.prepare(
      "UPDATE connector_events SET status = ?, response_json = ?, error_code = ?, completed_at = ? WHERE id = ? AND tenant_id = ?"
    )
      .bind(
        result.ok ? "completed" : "failed",
        JSON.stringify(result.data || null),
        result.code || null,
        now(),
        eventId,
        auth.tenantId
      )
      .run();
    return c.json(
      {
        event_id: eventId,
        environment: installation.environment,
        ...result,
      },
      (result.ok ? 200 : 501) as any
    );
  }
);

export const connectorRoutes = router;
