import { Hono } from "hono";
import { z } from "zod";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env, HonoVariables } from "../types";
import { id, now, jsonError, appUrl, sendEmail } from "../utils/common";
import { bytesToHex, sha256 } from "../utils/crypto";
import { requireDashboard } from "../utils/auth";
import {
  canManageTenantMembers,
  canManageTenantSecrets,
  getInviteableTenantRoles,
  normalizeTenantRole,
} from "../tenant-roles";
import { acceptTenantInvitation } from "../tenant-invitations";

const router = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

router.get("/v1/organization/members", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  const members = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.status, m.role, m.created_at
     FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.tenant_id = ? ORDER BY m.created_at ASC`
  )
    .bind(auth.tenantId)
    .all();
  return c.json({ members: members.results });
});

router.get("/v1/organization/knowledge-retention", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  if (!canManageTenantSecrets(auth.role)) {
    return jsonError(c, "FORBIDDEN", "Owner or admin access is required.", 403);
  }
  const policy = await c.env.DB.prepare(
    "SELECT delete_processed_sources FROM tenant_knowledge_policies WHERE tenant_id = ?"
  )
    .bind(auth.tenantId)
    .first<{ delete_processed_sources: number }>();
  return c.json({
    delete_processed_sources: Boolean(policy?.delete_processed_sources),
  });
});

router.patch("/v1/organization/knowledge-retention", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  if (!canManageTenantSecrets(auth.role)) {
    return jsonError(c, "FORBIDDEN", "Owner or admin access is required.", 403);
  }
  const parsed = z
    .object({ delete_processed_sources: z.boolean() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(
      c,
      "INVALID_REQUEST",
      "delete_processed_sources must be a boolean.",
      400
    );
  }
  const timestamp = now();
  await c.env.DB.prepare(
    `INSERT INTO tenant_knowledge_policies (tenant_id, delete_processed_sources, updated_by, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(tenant_id) DO UPDATE SET delete_processed_sources = excluded.delete_processed_sources,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`
  )
    .bind(
      auth.tenantId,
      Number(parsed.data.delete_processed_sources),
      auth.userId,
      timestamp
    )
    .run();
  return c.json({ delete_processed_sources: parsed.data.delete_processed_sources });
});

router.post("/v1/organization/invitations", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
  if (!canManageTenantMembers(auth.role)) {
    return jsonError(c, "FORBIDDEN", "Owner or admin access is required.", 403);
  }

  const parsed = z
    .object({
      email: z.string().trim().email().max(255),
      role: z.enum(["admin", "member"]).default("member"),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(
      c,
      "INVALID_REQUEST",
      "A valid email and role are required.",
      400
    );
  }

  const role = normalizeTenantRole(parsed.data.role);
  if (!getInviteableTenantRoles().includes(role)) {
    return jsonError(
      c,
      "INVALID_REQUEST",
      "Only admin or member roles may be assigned to tenant members.",
      400
    );
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await c.env.DB.prepare(
    "SELECT id FROM users WHERE email = ?"
  )
    .bind(email)
    .first<{ id: string }>();
  if (existing) {
    const membership = await c.env.DB.prepare(
      "SELECT id FROM memberships WHERE tenant_id = ? AND user_id = ?"
    )
      .bind(auth.tenantId, existing.id)
      .first();
    if (membership) {
      return jsonError(
        c,
        "ALREADY_MEMBER",
        "This user is already a tenant member.",
        409
      );
    }
    await c.env.DB.prepare(
      "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(id("mem"), auth.tenantId, existing.id, role, now())
      .run();
    return c.json({ added: true, user_id: existing.id, role });
  }

  const invitationId = id("inv");
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(24)));
  const createdAt = now();
  const expiresAt = createdAt + 7 * 86400000;
  await c.env.DB.prepare(
    `INSERT INTO tenant_invitations (id, tenant_id, email, role, token_hash, created_by, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      invitationId,
      auth.tenantId,
      email,
      role,
      await sha256(token),
      auth.userId,
      createdAt,
      expiresAt
    )
    .run();

  c.executionCtx.waitUntil(
    sendEmail(
      c,
      email,
      "You were invited to join a dLogicAI workspace",
      `<p>You have been invited to join a dLogicAI workspace.</p><p><a href="${appUrl(
        c,
        `/accept-invite?token=${encodeURIComponent(token)}`
      )}">Accept your invitation</a></p><p>This invitation expires on ${new Date(
        expiresAt
      ).toISOString()}.</p>`
    )
  );

  return c.json(
    {
      invitation: {
        id: invitationId,
        email,
        role,
        expires_at: expiresAt,
      },
      invitation_token: token,
    },
    201
  );
});

router.post("/v1/organization/invitations/accept", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

  const body = await c.req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";

  if (!token) {
    return jsonError(
      c,
      "INVALID_REQUEST",
      "A valid invitation token is required.",
      400
    );
  }

  const result = await acceptTenantInvitation(
    c.env.DB,
    auth.userId,
    token,
    now()
  );

  if (!result.ok) {
    const map: Record<string, ContentfulStatusCode> = {
      INVALID_INVITATION: 400,
      EXPIRED_INVITATION: 410,
      ALREADY_MEMBER: 409,
      USER_NOT_FOUND: 404,
    };

    return jsonError(
      c,
      result.code,
      result.code.replace(/_/g, " ").toLowerCase(),
      map[result.code] || 400
    );
  }

  return c.json({
    ok: true,
    tenantId: result.tenantId,
    role: result.role,
    membershipId: result.membershipId,
  });
});

export const organizationRoutes = router;
