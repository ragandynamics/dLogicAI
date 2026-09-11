import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types";
import { id, now, jsonError } from "../utils/common";
import { requireDashboard } from "../utils/auth";

const router = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

router.post("/v1/service-requests", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  const contentType = c.req.header("content-type") || "";
  const form = contentType.includes("multipart/form-data")
    ? await c.req.formData().catch(() => null)
    : null;
  const body = form
    ? {
        subject: form.get("subject"),
        description: form.get("description"),
        project_id: form.get("project_id") || undefined,
      }
    : await c.req.json().catch(() => ({}));
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
  const screenshot = form?.get("screenshot");
  let screenshotKey: string | null = null;
  let screenshotName: string | null = null;
  let screenshotType: string | null = null;
  let screenshotSize: number | null = null;
  if (screenshot instanceof File && screenshot.size > 0) {
    const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
    if (!allowedTypes.has(screenshot.type) || screenshot.size > 5 * 1024 * 1024) {
      return jsonError(c, "INVALID_SCREENSHOT", "Attach a PNG, JPEG, or WebP image up to 5 MB.", 400);
    }
    const bytes = new Uint8Array(await screenshot.arrayBuffer());
    const validSignature =
      (screenshot.type === "image/png" && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) ||
      (screenshot.type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
      (screenshot.type === "image/webp" && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP");
    if (!validSignature) {
      return jsonError(c, "INVALID_SCREENSHOT", "The screenshot file content is invalid.", 400);
    }
    screenshotKey = `tenants/${auth.tenantId}/problem-reports/${requestId}/screenshot`;
    screenshotName = screenshot.name.slice(0, 255) || "screenshot";
    screenshotType = screenshot.type;
    screenshotSize = screenshot.size;
    await c.env.DATA_BUCKET.put(screenshotKey, bytes, {
      httpMetadata: { contentType: screenshotType },
    });
  }
  try {
    await c.env.DB.prepare(
    `INSERT INTO service_requests
      (id,tenant_id,user_id,project_id,subject,description,status,progress_percent,
       screenshot_key,screenshot_name,screenshot_type,screenshot_size,created_at,updated_at)
    VALUES (?,?,?,?,?,?,'submitted',0,?,?,?,?,?,?)`
  )
    .bind(
      requestId,
      auth.tenantId,
      auth.userId,
      parsed.data.project_id || null,
      parsed.data.subject,
      parsed.data.description,
      screenshotKey,
      screenshotName,
      screenshotType,
      screenshotSize,
      t,
      t
    )
    .run();
  } catch (error) {
    if (screenshotKey) await c.env.DATA_BUCKET.delete(screenshotKey).catch(() => undefined);
    throw error;
  }
  return c.json(
    {
      service_request: {
        id: requestId,
        ...parsed.data,
        status: "submitted",
        progress_percent: 0,
        has_screenshot: Boolean(screenshotKey),
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
            screenshot_name, screenshot_type, screenshot_size,
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
            screenshot_name, screenshot_type, screenshot_size,
            external_system, external_id, external_url, created_at, updated_at
     FROM service_requests WHERE id=? AND tenant_id=?`
  )
    .bind(c.req.param("requestId"), auth.tenantId)
    .first();
  if (!request) return jsonError(c, "NOT_FOUND", "Service request not found.", 404);
  return c.json({ service_request: request });
});

router.get("/v1/service-requests/:requestId/screenshot", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  const request = await c.env.DB.prepare(
    `SELECT screenshot_key, screenshot_name, screenshot_type
     FROM service_requests WHERE id=? AND tenant_id=?`
  )
    .bind(c.req.param("requestId"), auth.tenantId)
    .first<{ screenshot_key: string | null; screenshot_name: string | null; screenshot_type: string | null }>();
  if (!request?.screenshot_key) return jsonError(c, "NOT_FOUND", "Screenshot not found.", 404);
  const object = await c.env.DATA_BUCKET.get(request.screenshot_key);
  if (!object) return jsonError(c, "NOT_FOUND", "Screenshot not found.", 404);
  const safeName = (request.screenshot_name || "screenshot").replace(/["\\\r\n]/g, "_");
  return new Response(object.body, {
    headers: {
      "Content-Type": request.screenshot_type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

export const serviceRequestRoutes = router;
