import { Hono } from "hono";
import type { Env, HonoVariables } from "../types";
import { jsonError } from "../utils/common";
import { requireDashboard } from "../utils/auth";
import { getCreditAccount, totalAvailableCredits } from "../services/credits";

const router = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

router.get("/v1/billing/credits", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

  const account = await getCreditAccount(c, auth.tenantId);
  if (!account) {
    return c.json({
      credits: {
        subscription: 0,
        purchased: 0,
        promotional: 0,
        available: 0,
        total_consumed: 0,
      },
    });
  }

  return c.json({
    credits: {
      subscription: account.subscription_balance,
      purchased: account.purchased_balance,
      promotional: account.promotional_balance,
      available: totalAvailableCredits(account),
      total_consumed: account.total_consumed,
      auto_topup: {
        enabled: Boolean(account.auto_topup_enabled),
        threshold: account.auto_topup_threshold,
        credits: account.auto_topup_credits,
        limit: account.auto_topup_limit,
      },
    },
  });
});

router.get("/v1/billing/credits/ledger", async (c) => {
  const auth = await requireDashboard(c);
  if (!auth) return jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

  const requestedLimit = Number(c.req.query("limit") || 100);
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
    return jsonError(
      c,
      "INVALID_REQUEST",
      "limit must be a positive integer.",
      400
    );
  }

  const limit = Math.min(requestedLimit, 100);
  const { results } = await c.env.DB.prepare(
    `SELECT
       id, entry_type, source, amount, balance_after, reference_type,
       reference_id, description, expires_at, created_at
     FROM credit_ledger
     WHERE tenant_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  )
    .bind(auth.tenantId, limit)
    .all();

  return c.json({ ledger: results });
});

export const creditRoutes = router;
