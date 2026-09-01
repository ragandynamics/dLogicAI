import { describe, it, expect } from 'vitest';
import {
  canAccessTenantLogs,
  canManageTenantDevEnvironment,
  canManageTenantMembers,
  canManageTenantSecrets,
  canManageTenantServices,
  getInviteableTenantRoles,
  normalizeTenantRole,
} from '../src/tenant-roles';

describe('Tenant role model', () => {
  it('normalizes the canonical tenant roles', () => {
    expect(normalizeTenantRole('OWNER')).toBe('owner');
    expect(normalizeTenantRole('Admin')).toBe('admin');
    expect(normalizeTenantRole('member')).toBe('member');
    expect(normalizeTenantRole('developer')).toBe('member');
  });

  it('allows only owner/admin to manage tenant members', () => {
    expect(canManageTenantMembers('owner')).toBe(true);
    expect(canManageTenantMembers('admin')).toBe(true);
    expect(canManageTenantMembers('member')).toBe(false);
  });

  it('restricts tenant secrets to owner/admin while allowing member workspace control', () => {
    expect(canManageTenantSecrets('owner')).toBe(true);
    expect(canManageTenantSecrets('admin')).toBe(true);
    expect(canManageTenantSecrets('member')).toBe(false);
  });

  it('grants tenant members full control over dev environments, services, and logs', () => {
    expect(canManageTenantDevEnvironment('owner')).toBe(true);
    expect(canManageTenantDevEnvironment('admin')).toBe(true);
    expect(canManageTenantDevEnvironment('member')).toBe(true);

    expect(canManageTenantServices('owner')).toBe(true);
    expect(canManageTenantServices('admin')).toBe(true);
    expect(canManageTenantServices('member')).toBe(true);

    expect(canAccessTenantLogs('owner')).toBe(true);
    expect(canAccessTenantLogs('admin')).toBe(true);
    expect(canAccessTenantLogs('member')).toBe(true);
  });

  it('exposes the invite-safe tenant roles', () => {
    expect(getInviteableTenantRoles()).toEqual(['admin', 'member']);
  });
});
