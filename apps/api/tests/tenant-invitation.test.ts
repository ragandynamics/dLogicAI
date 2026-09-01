import { describe, it, expect } from 'vitest';
import { acceptTenantInvitation } from '../src/tenant-invitations';

describe('Tenant invitation acceptance', () => {
  it('accepts a valid pending invitation and creates a membership', async () => {
    const db = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () => {
            if (sql.includes('SELECT email FROM users')) return { email: 'new.user@example.com' };
            if (sql.includes('SELECT id, tenant_id, email, role, status, expires_at')) return { id: 'inv_1', tenant_id: 'tenant_1', email: 'new.user@example.com', role: 'member', status: 'pending', expires_at: 999999999999 };
            if (sql.includes('SELECT id FROM memberships')) return null;
            return null;
          },
          run: async () => ({ success: true }),
        }),
      }),
      batch: async (statements: any[]) => {
        expect(statements).toHaveLength(2);
        return statements;
      },
    } as any;

    const result = await acceptTenantInvitation(db, 'user_1', 'secret-token', 1000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tenantId).toBe('tenant_1');
      expect(result.role).toBe('member');
    }
  });

  it('rejects expired or invalid invitation tokens', async () => {
    const db = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () => {
            if (sql.includes('SELECT email FROM users')) return { email: 'new.user@example.com' };
            if (sql.includes('SELECT id, tenant_id, email, role, status, expires_at')) return { id: 'inv_1', tenant_id: 'tenant_1', email: 'new.user@example.com', role: 'member', status: 'pending', expires_at: 10 };
            return null;
          },
          run: async () => ({ success: true }),
        }),
      }),
      batch: async () => [],
    } as any;

    const result = await acceptTenantInvitation(db, 'user_1', 'secret-token', 1000);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('EXPIRED_INVITATION');
    }
  });
});
