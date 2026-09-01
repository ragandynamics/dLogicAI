import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types";
import { id, now, jsonError } from "../utils/common";
import { bytesToHex } from "../utils/crypto";
import { requireDashboard } from "../utils/auth";
import { canManageTenantServices } from "../tenant-roles";
import { getOwnedProject } from "../services/channels";
import {
  exceedsKnowledgeLimit,
  getKnowledgePlanLimits,
  processKnowledgeDocument,
} from "../services/knowledge";

const router = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

router.get("/v1/projects/:projectId/knowledge-bases", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  if (!canManageTenantServices(auth.role)) {
    return jsonError(c, "FORBIDDEN", "Tenant workspace access is required.", 403);
  }
  const project = await getOwnedProject(
    c,
    c.req.param("projectId"),
    auth.tenantId
  );
  if (!project) return jsonError(c, "NOT_FOUND", "Project not found.", 404);
  const rows = await c.env.DB.prepare(
    `SELECT id, project_id, name, description, status, created_at, updated_at
     FROM knowledge_bases WHERE tenant_id = ? AND project_id = ? ORDER BY created_at DESC`
  )
    .bind(auth.tenantId, project.id)
    .all();
  return c.json({ knowledge_bases: rows.results });
});

router.post("/v1/projects/:projectId/knowledge-bases", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  if (!canManageTenantServices(auth.role)) {
    return jsonError(c, "FORBIDDEN", "Tenant workspace access is required.", 403);
  }
  const project = await getOwnedProject(
    c,
    c.req.param("projectId"),
    auth.tenantId
  );
  if (!project) return jsonError(c, "NOT_FOUND", "Project not found.", 404);
  const plan = await getKnowledgePlanLimits(c, auth.tenantId);
  const existingBases = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM knowledge_bases WHERE tenant_id = ?"
  )
    .bind(auth.tenantId)
    .first<{ count: number }>();
  if (
    exceedsKnowledgeLimit(
      plan?.max_knowledge_bases,
      Number(existingBases?.count || 0),
      1
    )
  ) {
    return jsonError(
      c,
      "KNOWLEDGE_BASE_LIMIT_REACHED",
      "Your plan has reached its knowledge base limit.",
      402
    );
  }
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(120),
      description: z.string().trim().max(500).optional().nullable(),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(c, "INVALID_REQUEST", "A knowledge base name is required.", 400);
  }
  const knowledgeBaseId = id("kb");
  const timestamp = now();
  try {
    await c.env.DB.prepare(
      `INSERT INTO knowledge_bases (id, tenant_id, project_id, name, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        knowledgeBaseId,
        auth.tenantId,
        project.id,
        parsed.data.name,
        parsed.data.description || null,
        timestamp,
        timestamp
      )
      .run();
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      return jsonError(
        c,
        "ALREADY_EXISTS",
        "A knowledge base with this name already exists in the project.",
        409
      );
    }
    throw error;
  }
  return c.json(
    {
      knowledge_base: {
        id: knowledgeBaseId,
        project_id: project.id,
        ...parsed.data,
        status: "active",
        created_at: timestamp,
        updated_at: timestamp,
      },
    },
    201
  );
});

router.get(
  "/v1/projects/:projectId/knowledge-bases/:knowledgeBaseId/documents",
  async (c) => {
    const auth = await requireDashboard(c);
    if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
    const knowledgeBase = await c.env.DB.prepare(
      `SELECT id FROM knowledge_bases WHERE id = ? AND project_id = ? AND tenant_id = ?`
    )
      .bind(
        c.req.param("knowledgeBaseId"),
        c.req.param("projectId"),
        auth.tenantId
      )
      .first();
    if (!knowledgeBase) return jsonError(c, "NOT_FOUND", "Knowledge base not found.", 404);
    const documents = await c.env.DB.prepare(
      `SELECT id, name, content_type, source_uri, checksum, status, error_message, created_at, updated_at
     FROM knowledge_base_documents WHERE knowledge_base_id = ? AND tenant_id = ? ORDER BY created_at DESC`
    )
      .bind(c.req.param("knowledgeBaseId"), auth.tenantId)
      .all();
    return c.json({ documents: documents.results });
  }
);

router.post(
  "/v1/projects/:projectId/knowledge-bases/:knowledgeBaseId/documents",
  async (c) => {
    const auth = await requireDashboard(c);
    if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
    if (!canManageTenantServices(auth.role)) {
      return jsonError(c, "FORBIDDEN", "Tenant workspace access is required.", 403);
    }

    const knowledgeBase = await c.env.DB.prepare(
      `SELECT id FROM knowledge_bases WHERE id = ? AND project_id = ? AND tenant_id = ?`
    )
      .bind(
        c.req.param("knowledgeBaseId"),
        c.req.param("projectId"),
        auth.tenantId
      )
      .first();
    if (!knowledgeBase) return jsonError(c, "NOT_FOUND", "Knowledge base not found.", 404);

    const plan = await getKnowledgePlanLimits(c, auth.tenantId);
    const existingDocuments = await c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM knowledge_base_documents WHERE tenant_id = ?"
    )
      .bind(auth.tenantId)
      .first<{ count: number }>();
    if (
      exceedsKnowledgeLimit(
        plan?.max_documents,
        Number(existingDocuments?.count || 0),
        1
      )
    ) {
      return jsonError(
        c,
        "DOCUMENT_LIMIT_REACHED",
        "Your plan has reached its knowledge document limit.",
        402
      );
    }

    const form = await c.req.raw.formData().catch(() => null);
    const value = form?.get("file");
    if (!(value instanceof File)) {
      return jsonError(c, "INVALID_REQUEST", "A document file is required.", 400);
    }

    const maxBytes = Number(
      plan?.max_document_size_bytes || 25 * 1024 * 1024
    );
    if (value.size < 1 || value.size > maxBytes) {
      return jsonError(
        c,
        "FILE_TOO_LARGE",
        "This document exceeds your plan's file-size limit.",
        413
      );
    }
    const storedBytes = await c.env.DB.prepare(
      "SELECT COALESCE(SUM(size_bytes), 0) AS total FROM knowledge_base_documents WHERE tenant_id = ? AND storage_key IS NOT NULL"
    )
      .bind(auth.tenantId)
      .first<{ total: number }>();
    if (
      exceedsKnowledgeLimit(
        plan?.max_storage_bytes,
        Number(storedBytes?.total || 0),
        value.size
      )
    ) {
      return jsonError(
        c,
        "STORAGE_LIMIT_REACHED",
        "This upload exceeds your plan's knowledge storage limit.",
        402
      );
    }
    const allowedTypes = new Set([
      "application/pdf",
      "application/json",
      "text/csv",
      "text/html",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    if (!allowedTypes.has(value.type)) {
      return jsonError(
        c,
        "UNSUPPORTED_FILE_TYPE",
        "Supported documents are PDF, DOCX, JSON, CSV, HTML, and plain text.",
        415
      );
    }

    const documentId = id("doc");
    const timestamp = now();
    const safeName =
      value.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "document";
    const storageKey = `tenants/${auth.tenantId}/projects/${c.req.param(
      "projectId"
    )}/knowledge-bases/${c.req.param(
      "knowledgeBaseId"
    )}/documents/${documentId}/${safeName}`;
    const checksum = bytesToHex(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", await value.arrayBuffer())
      )
    );
    const duplicate = await c.env.DB.prepare(
      "SELECT id FROM knowledge_base_documents WHERE tenant_id = ? AND checksum = ? LIMIT 1"
    )
      .bind(auth.tenantId, checksum)
      .first();
    if (duplicate) {
      return jsonError(
        c,
        "DUPLICATE_DOCUMENT",
        "This document is already stored in the workspace.",
        409
      );
    }

    await c.env.DB.prepare(
      `INSERT INTO knowledge_base_documents
      (id, tenant_id, project_id, knowledge_base_id, name, content_type, storage_key, checksum, size_bytes, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
      .bind(
        documentId,
        auth.tenantId,
        c.req.param("projectId"),
        c.req.param("knowledgeBaseId"),
        safeName,
        value.type,
        storageKey,
        checksum,
        value.size,
        timestamp,
        timestamp
      )
      .run();

    try {
      await c.env.DATA_BUCKET.put(storageKey, value.stream(), {
        httpMetadata: { contentType: value.type },
        customMetadata: {
          tenant_id: auth.tenantId,
          project_id: c.req.param("projectId"),
          knowledge_base_id: c.req.param("knowledgeBaseId"),
          document_id: documentId,
        },
      });
    } catch (error) {
      await c.env.DB.prepare(
        "UPDATE knowledge_base_documents SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ? AND tenant_id = ?"
      )
        .bind(String(error).slice(0, 500), now(), documentId, auth.tenantId)
        .run();
      return jsonError(c, "STORAGE_ERROR", "The document could not be stored.", 503);
    }

    return c.json(
      {
        document: {
          id: documentId,
          name: safeName,
          content_type: value.type,
          size_bytes: value.size,
          checksum,
          status: "pending",
          processing: "queued",
          created_at: timestamp,
        },
      },
      201
    );
  }
);

router.post(
  "/v1/projects/:projectId/knowledge-bases/:knowledgeBaseId/documents/:documentId/process",
  async (c) => {
    const auth = await requireDashboard(c);
    if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
    if (!canManageTenantServices(auth.role)) {
      return jsonError(c, "FORBIDDEN", "Tenant workspace access is required.", 403);
    }
    const document = await c.env.DB.prepare(
      `SELECT id FROM knowledge_base_documents
     WHERE id = ? AND knowledge_base_id = ? AND project_id = ? AND tenant_id = ?`
    )
      .bind(
        c.req.param("documentId"),
        c.req.param("knowledgeBaseId"),
        c.req.param("projectId"),
        auth.tenantId
      )
      .first();
    if (!document) return jsonError(c, "NOT_FOUND", "Document not found.", 404);
    const result = await processKnowledgeDocument(
      c,
      c.req.param("documentId"),
      auth.tenantId
    );
    if (!result.ok) {
      if (result.code === "UNSUPPORTED_EXTRACTION") {
        return jsonError(
          c,
          result.code,
          "PDF and DOCX extraction is not available yet. Upload a plain text, CSV, HTML, or JSON document.",
          422
        );
      }
      if (result.code === "PROCESSING_DEFERRED") {
        return jsonError(
          c,
          result.code,
          "This document is too large for synchronous processing and is queued for asynchronous extraction.",
          202
        );
      }
      return jsonError(
        c,
        result.code || "PROCESSING_ERROR",
        "The document could not be processed.",
        422
      );
    }
    return c.json({ processed: true, chunks: result.chunks });
  }
);

router.get(
  "/v1/projects/:projectId/knowledge-bases/:knowledgeBaseId/documents/:documentId/download",
  async (c) => {
    const auth = await requireDashboard(c);
    if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
    const document = await c.env.DB.prepare(
      `SELECT name, content_type, storage_key FROM knowledge_base_documents
     WHERE id = ? AND knowledge_base_id = ? AND project_id = ? AND tenant_id = ?`
    )
      .bind(
        c.req.param("documentId"),
        c.req.param("knowledgeBaseId"),
        c.req.param("projectId"),
        auth.tenantId
      )
      .first<{
        name: string;
        content_type: string | null;
        storage_key: string | null;
      }>();
    if (!document?.storage_key) {
      return jsonError(c, "NOT_FOUND", "Document not found.", 404);
    }
    const object = await c.env.DATA_BUCKET.get(document.storage_key);
    if (!object) {
      return jsonError(c, "NOT_FOUND", "Document content is not available.", 404);
    }
    const headers = new Headers();
    headers.set(
      "Content-Type",
      document.content_type ||
        object.httpMetadata?.contentType ||
        "application/octet-stream"
    );
    headers.set(
      "Content-Disposition",
      `attachment; filename="${document.name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`
    );
    headers.set("ETag", object.httpEtag);
    return new Response(object.body, { headers });
  }
);

router.delete(
  "/v1/projects/:projectId/knowledge-bases/:knowledgeBaseId/documents/:documentId",
  async (c) => {
    const auth = await requireDashboard(c);
    if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
    if (!canManageTenantServices(auth.role)) {
      return jsonError(c, "FORBIDDEN", "Tenant workspace access is required.", 403);
    }
    const document = await c.env.DB.prepare(
      `SELECT storage_key FROM knowledge_base_documents
     WHERE id = ? AND knowledge_base_id = ? AND project_id = ? AND tenant_id = ?`
    )
      .bind(
        c.req.param("documentId"),
        c.req.param("knowledgeBaseId"),
        c.req.param("projectId"),
        auth.tenantId
      )
      .first<{ storage_key: string | null }>();
    if (!document) return jsonError(c, "NOT_FOUND", "Document not found.", 404);
    if (document.storage_key) await c.env.DATA_BUCKET.delete(document.storage_key);
    await c.env.DB.prepare(
      "DELETE FROM knowledge_base_documents WHERE id = ? AND tenant_id = ?"
    )
      .bind(c.req.param("documentId"), auth.tenantId)
      .run();
    return c.json({ deleted: true });
  }
);

router.put(
  "/v1/projects/:projectId/chat-services/:serviceId/knowledge-bases",
  async (c) => {
    const auth = await requireDashboard(c);
    if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
    if (!canManageTenantServices(auth.role)) {
      return jsonError(c, "FORBIDDEN", "Tenant workspace access is required.", 403);
    }
    const service = await c.env.DB.prepare(
      `SELECT id FROM chat_services WHERE id = ? AND project_id = ? AND tenant_id = ?`
    )
      .bind(
        c.req.param("serviceId"),
        c.req.param("projectId"),
        auth.tenantId
      )
      .first();
    if (!service) return jsonError(c, "NOT_FOUND", "Chat Service not found.", 404);
    const parsed = z
      .object({
        knowledge_base_ids: z
          .array(z.string().trim().min(1).max(120))
          .max(50),
      })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonError(c, "INVALID_REQUEST", "knowledge_base_ids must be an array.", 400);
    }
    const uniqueIds = [...new Set(parsed.data.knowledge_base_ids)];
    const plan = await getKnowledgePlanLimits(c, auth.tenantId);
    if (
      exceedsKnowledgeLimit(
        plan?.max_attached_knowledge_bases,
        0,
        uniqueIds.length
      )
    ) {
      return jsonError(
        c,
        "KNOWLEDGE_ATTACHMENT_LIMIT_REACHED",
        "This Chat Service exceeds your plan's knowledge base attachment limit.",
        402
      );
    }
    if (uniqueIds.length) {
      const placeholders = uniqueIds.map(() => "?").join(",");
      const owned = await c.env.DB.prepare(
        `SELECT id FROM knowledge_bases WHERE tenant_id = ? AND project_id = ? AND id IN (${placeholders})`
      )
        .bind(auth.tenantId, c.req.param("projectId"), ...uniqueIds)
        .all<{ id: string }>();
      if (owned.results.length !== uniqueIds.length) {
        return jsonError(
          c,
          "INVALID_REQUEST",
          "Every knowledge base must belong to this project.",
          400
        );
      }
    }
    const statements = [
      c.env.DB.prepare(
        "DELETE FROM chat_service_knowledge_bases WHERE chat_service_id = ? AND tenant_id = ?"
      ).bind(c.req.param("serviceId"), auth.tenantId),
    ];
    const timestamp = now();
    for (const knowledgeBaseId of uniqueIds) {
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO chat_service_knowledge_bases (chat_service_id, knowledge_base_id, tenant_id, created_at) VALUES (?, ?, ?, ?)"
        ).bind(
          c.req.param("serviceId"),
          knowledgeBaseId,
          auth.tenantId,
          timestamp
        )
      );
    }
    await c.env.DB.batch(statements);
    return c.json({ knowledge_base_ids: uniqueIds });
  }
);

export const knowledgeBaseRoutes = router;
