export const TENANT_ROLE_ORDER = ["owner", "admin", "developer", "billing", "sales_operations"] as const;
export type TenantRole = typeof TENANT_ROLE_ORDER[number];

export const TENANT_ROLES = new Set<string>(TENANT_ROLE_ORDER);

export function normalizeTenantRole(role: string | null | undefined): TenantRole {
  if (!role) return "developer";

  const normalized = role.toLowerCase().trim();

  if (normalized === "owner") return "owner";
  if (normalized === "admin") return "admin";
  if (normalized === "billing") return "billing";
  if (normalized === "sales_operations") return "sales_operations";
  if (normalized === "developer" || normalized === "member") return "developer";

  return "developer";
}

export function canManageTenantMembers(role: string | null | undefined): boolean {
  const normalized = normalizeTenantRole(role);
  return normalized === "owner" || normalized === "admin";
}

export function canManageTenantDevEnvironment(role: string | null | undefined): boolean {
  const normalized = normalizeTenantRole(role);
  return normalized === "owner" || normalized === "admin" || normalized === "developer";
}

export function canManageTenantServices(role: string | null | undefined): boolean {
  return canManageTenantDevEnvironment(role);
}

export function canManageTenantSecrets(role: string | null | undefined): boolean {
  const normalized = normalizeTenantRole(role);
  return normalized === "owner" || normalized === "admin";
}

export function canAccessTenantLogs(role: string | null | undefined): boolean {
  return TENANT_ROLES.has(normalizeTenantRole(role));
}

export function getInviteableTenantRoles(): TenantRole[] {
  return ["admin", "developer", "billing", "sales_operations"];
}
