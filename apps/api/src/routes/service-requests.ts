import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types";
import { id, now, jsonError } from "../utils/common";
import { requireDashboard } from "../utils/auth";

const router = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

router.post("/v1/service-requests", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  const body = await c.req.json().catch(() => ({}));
  const parsed = z
    .object({
      subject: z.string().trim().min(3).max(160),
      description: z.string().trim().min(1).max(10000),
      project_id: z.string().trim().min(1).optional(),
    })
    .safeParse(body);
  if (!parsed.success) {
    return jsonError(c, "INVALID_REQUEST", "Subject and description are required.");
  }

  if (parsed.data.project_id) {
    const project = await c.env.DB.prepare(
      "SELECT id FROM projects WHERE id=? AND tenant_id=?"
    )
      .bind(parsed.data.project_id, auth.tenantId)
      .first();
    if (!project) return jsonError(c, "NOT_FOUND", "Project not found.", 404);
  }

  const requestId = id("sr");
  const t = now();
  await c.env.DB.prepare(
    `INSERT INTO service_requests
      (id,tenant_id,user_id,project_id,subject,description,status,progress_percent,created_at,updated_at)
    VALUES (?,?,?,?,?,?,'submitted',0,?,?)`
  )
    .bind(
      requestId,
      auth.tenantId,
      auth.userId,
      parsed.data.project_id || null,
      parsed.data.subject,
      parsed.data.description,
      t,
      t
    )
    .run();
  return c.json(
    {
      service_request: {
        id: requestId,
        ...parsed.data,
        status: "submitted",
        progress_percent: 0,
        created_at: t,
        updated_at: t,
      },
    },
    201
  );
});

router.get("/v1/service-requests", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  const rows = await c.env.DB.prepare(
    `SELECT id, project_id, subject, description, status, progress_percent,
            external_system, external_id, external_url, created_at, updated_at
     FROM service_requests WHERE tenant_id=? ORDER BY created_at DESC`
  )
    .bind(auth.tenantId)
    .all();
  return c.json({ service_requests: rows.results });
});

router.get("/v1/service-requests/:requestId", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  const request = await c.env.DB.prepare(
    `SELECT id, project_id, subject, description, status, progress_percent,
            external_system, external_id, external_url, created_at, updated_at
     FROM service_requests WHERE id=? AND tenant_id=?`
  )
    .bind(c.req.param("requestId"), auth.tenantId)
    .first();
  if (!request) return jsonError(c, "NOT_FOUND", "Service request not found.", 404);
  return c.json({ service_request: request });
});

export const serviceRequestRoutes = router;
