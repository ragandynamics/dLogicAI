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
    expect(normalizeTenantRole('member')).toBe('developer');
    expect(normalizeTenantRole('developer')).toBe('developer');
    expect(normalizeTenantRole('billing')).toBe('billing');
    expect(normalizeTenantRole('sales_operations')).toBe('sales_operations');
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

  it('grants developers build access without granting it to billing or sales operations', () => {
    expect(canManageTenantDevEnvironment('owner')).toBe(true);
    expect(canManageTenantDevEnvironment('admin')).toBe(true);
    expect(canManageTenantDevEnvironment('developer')).toBe(true);
    expect(canManageTenantDevEnvironment('billing')).toBe(false);
    expect(canManageTenantDevEnvironment('sales_operations')).toBe(false);

    expect(canManageTenantServices('owner')).toBe(true);
    expect(canManageTenantServices('admin')).toBe(true);
    expect(canManageTenantServices('developer')).toBe(true);
    expect(canManageTenantServices('billing')).toBe(false);

    expect(canAccessTenantLogs('owner')).toBe(true);
    expect(canAccessTenantLogs('admin')).toBe(true);
    expect(canAccessTenantLogs('developer')).toBe(true);
    expect(canAccessTenantLogs('billing')).toBe(true);
    expect(canAccessTenantLogs('sales_operations')).toBe(true);
  });

  it('exposes the invite-safe tenant roles', () => {
    expect(getInviteableTenantRoles()).toEqual(['admin', 'developer', 'billing', 'sales_operations']);
  });
});
