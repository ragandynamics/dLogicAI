import type { AppContext, AuthContext } from "../types";
import { id, now } from "../utils/common";

// Audit records and their mutations commit together; unmatched writes record no event.
// Never copy request bodies, credentials or provider responses into metadata.
export async function auditMutation(c: AppContext, auth: Pick<AuthContext, "tenantId" | "userId">, action: string, resourceType: string, resourceId: string, mutation: D1PreparedStatement) {
  const requestId = id("request");
  c.header?.("X-Request-ID", requestId);
  const results = await c.env.DB.batch([
    mutation,
    c.env.DB.prepare(`INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, metadata_json, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() > 0`)
      .bind(id("audit"), auth.tenantId, auth.userId, action, resourceType, resourceId, JSON.stringify({ request_id: requestId }), now()),
  ]);
  return results[0];
}
