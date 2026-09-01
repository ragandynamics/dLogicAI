import { normalizeTenantRole } from './tenant-roles';

export type TenantInvitationAcceptanceResult =
  | { ok: true; tenantId: string; role: string; membershipId: string }
  | { ok: false; code: 'INVALID_INVITATION' | 'EXPIRED_INVITATION' | 'ALREADY_MEMBER' | 'USER_NOT_FOUND'; };

export async function acceptTenantInvitation(
  db: any,
  userId: string,
  token: string,
  nowTs: number,
): Promise<TenantInvitationAcceptanceResult> {
  if (!userId || !token) {
    return { ok: false, code: 'INVALID_INVITATION' };
  }

  const user = await db.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first() as { email: string } | null;
  if (!user) {
    return { ok: false, code: 'USER_NOT_FOUND' };
  }

  const invitation = await db.prepare(
    `SELECT id, tenant_id, email, role, status, expires_at
     FROM tenant_invitations
     WHERE token_hash = ?
     LIMIT 1`
  ).bind(await sha256(token)).first() as { id: string; tenant_id: string; email: string; role: string; status: string; expires_at: number } | null;

  if (!invitation) {
    return { ok: false, code: 'INVALID_INVITATION' };
  }

  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    return { ok: false, code: 'INVALID_INVITATION' };
  }

  if (invitation.status !== 'pending') {
    return { ok: false, code: 'INVALID_INVITATION' };
  }

  if (invitation.expires_at <= nowTs) {
    return { ok: false, code: 'EXPIRED_INVITATION' };
  }

  const existing = await db.prepare(
    'SELECT id FROM memberships WHERE tenant_id = ? AND user_id = ?'
  ).bind(invitation.tenant_id, userId).first() as { id: string } | null;

  if (existing) {
    return { ok: false, code: 'ALREADY_MEMBER' };
  }

  const membershipId = `mem_${Math.random().toString(36).slice(2, 12)}`;
  const role = normalizeTenantRole(invitation.role);

  await db.batch([
    db.prepare(
      'INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(membershipId, invitation.tenant_id, userId, role, nowTs),
    db.prepare(
      'UPDATE tenant_invitations SET status = ? WHERE id = ?'
    ).bind('accepted', invitation.id),
  ]);

  return { ok: true, tenantId: invitation.tenant_id, role, membershipId };
}

async function sha256(value: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
