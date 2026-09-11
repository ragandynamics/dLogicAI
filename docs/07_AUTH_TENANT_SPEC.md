# dLogicAI Authentication & Tenant Specification
## Session context
Authentication context should contain:
- userId
- active tenantId
- role / effective permissions

## Multi-organization behavior
A user may belong to multiple organizations. The active organization must be explicit and switchable; authorization must never depend on arbitrary membership ordering.

## Roles
At minimum support organization-level owner/admin/member semantics, with extensibility for project-level roles.

Tenant owners and admins may add existing users to their tenant or create pending invitations for new users. Invitation delivery and acceptance are separate workflow steps.
