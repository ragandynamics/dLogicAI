import type { AppContext } from "../types";
import { id, now } from "../utils/common";

export async function reserveUsage(
  c: AppContext,
  plan: any,
  requestId: string,
  projectId: string,
  provider: string,
  model: string,
  billingMode: string,
  inputLanguage: string,
  outputLanguage: string
): Promise<boolean> {
  if (!plan) {
    return true;
  }

  const periodStart = Number(plan.current_period_start || 0);
  const includedRequests = Number(plan.included_requests || 0);

  const auth = c.get("auth");
  if (!auth) {
    return false;
  }

  const result = await c.env.DB.prepare(
    `
    INSERT INTO usage_events (
      id,
      request_id,
      tenant_id,
      project_id,
      provider,
      model,
      billing_mode,
      status,
      request_count,
      input_language,
      output_language,
      input_tokens,
      output_tokens,
      total_tokens,
      provider_cost_micros,
      customer_charge_micros,
      created_at
    )
    SELECT
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      'reserved',
      1,
      ?,
      ?,
      0,
      0,
      0,
      0,
      0,
      ?
    WHERE (
      SELECT COALESCE(
        SUM(request_count),
        0
      )
      FROM usage_events
      WHERE tenant_id = ?
        AND created_at >= ?
        AND status IN (
          'reserved',
          'completed'
        )
    ) < ?
    `
  )
    .bind(
      id("use"),
      requestId,
      auth.tenantId,
      projectId,
      provider,
      model,
      billingMode,
      inputLanguage,
      outputLanguage,
      now(),
      auth.tenantId,
      periodStart,
      includedRequests
    )
    .run();

  return Number(result.meta?.changes || 0) === 1;
}
