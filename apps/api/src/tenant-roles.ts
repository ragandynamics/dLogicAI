export const TENANT_ROLE_ORDER = ["owner", "admin", "member"] as const;
export type TenantRole = typeof TENANT_ROLE_ORDER[number];

export const TENANT_ROLES = new Set<string>(TENANT_ROLE_ORDER);

export function normalizeTenantRole(role: string | null | undefined): TenantRole {
  if (!role) return "member";

  const normalized = role.toLowerCase().trim();

  if (normalized === "owner") return "owner";
  if (normalized === "admin") return "admin";

  return "member";
}

export function canManageTenantMembers(role: string | null | undefined): boolean {
  const normalized = normalizeTenantRole(role);
  return normalized === "owner" || normalized === "admin";
}

export function canManageTenantDevEnvironment(role: string | null | undefined): boolean {
  return TENANT_ROLES.has(normalizeTenantRole(role));
}

export function canManageTenantServices(role: string | null | undefined): boolean {
  return TENANT_ROLES.has(normalizeTenantRole(role));
}

export function canManageTenantSecrets(role: string | null | undefined): boolean {
  const normalized = normalizeTenantRole(role);
  return normalized === "owner" || normalized === "admin";
}

export function canAccessTenantLogs(role: string | null | undefined): boolean {
  return TENANT_ROLES.has(normalizeTenantRole(role));
}

export function getInviteableTenantRoles(): TenantRole[] {
  return ["admin", "member"];
}
