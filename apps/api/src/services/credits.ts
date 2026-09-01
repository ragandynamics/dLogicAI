import type { AppContext, CreditAccount } from "../types";
import { id, now } from "../utils/common";

export function totalAvailableCredits(account: CreditAccount): number {
  return (
    account.subscription_balance +
    account.purchased_balance +
    account.promotional_balance
  );
}

export async function getCreditAccount(
  c: AppContext,
  tenantId: string
): Promise<CreditAccount | null> {
  return (await c.env.DB.prepare(
    `
    SELECT *
    FROM credit_accounts
    WHERE tenant_id = ?
    `
  )
    .bind(tenantId)
    .first()) as CreditAccount | null;
}

export async function createCreditAccount(
  c: AppContext,
  tenantId: string,
  initialCredits: number
): Promise<string> {
  const accountId = id("cred");
  const t = now();

  await c.env.DB.batch([
    c.env.DB.prepare(
      `
      INSERT INTO credit_accounts (
        id,
        tenant_id,
        subscription_balance,
        purchased_balance,
        promotional_balance,
        total_consumed,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 0, 0, 0, ?, ?)
      `
    ).bind(accountId, tenantId, initialCredits, t, t),

    c.env.DB.prepare(
      `
      INSERT INTO credit_ledger (
        id,
        tenant_id,
        credit_account_id,
        entry_type,
        source,
        amount,
        balance_after,
        reference_type,
        reference_id,
        description,
        created_at
      )
      VALUES (?, ?, ?, 'credit', 'subscription', ?, ?, 'subscription', ?, ?, ?)
      `
    ).bind(
      id("led"),
      tenantId,
      accountId,
      initialCredits,
      initialCredits,
      "initial_subscription",
      "Initial subscription AI credits",
      t
    ),
  ]);

  return accountId;
}

export async function reserveCredits(
  c: AppContext,
  tenantId: string,
  requestId: string,
  projectId: string,
  requestedCredits: number
): Promise<{
  ok: boolean;
  code?: string;
  reserved?: number;
  idempotent?: boolean;
  available?: number;
  required?: number;
}> {
  if (!Number.isSafeInteger(requestedCredits) || requestedCredits <= 0) {
    return { ok: false, code: "INVALID_CREDIT_RESERVATION" };
  }

  const existing = await c.env.DB.prepare(
    `SELECT tenant_id, project_id, reserved_credits, status
     FROM credit_reservations WHERE request_id = ?`
  ).bind(requestId).first<{
    tenant_id: string;
    project_id: string | null;
    reserved_credits: number;
    status: string;
  }>();

  if (existing) {
    if (
      existing.tenant_id !== tenantId ||
      existing.project_id !== projectId ||
      Number(existing.reserved_credits) !== requestedCredits
    ) {
      return { ok: false, code: "IDEMPOTENCY_KEY_REUSED" };
    }
    return { ok: true, reserved: requestedCredits, idempotent: true };
  }

  const t = now();
  const reservationId = id("cres");
  const ledgerId = id("led");
  const results = await c.env.DB.batch([
    // Insert first so changes() gates the debit to a newly-created reservation.
    c.env.DB.prepare(
      `
      INSERT OR IGNORE INTO credit_reservations (
        id, tenant_id, credit_account_id, request_id, project_id,
        reserved_credits, promotional_credits, subscription_credits,
        purchased_credits, status, created_at
      )
      SELECT
        ?, tenant_id, id, ?, ?, ?,
        MIN(promotional_balance, ?),
        MIN(subscription_balance, MAX(? - promotional_balance, 0)),
        MAX(? - promotional_balance - subscription_balance, 0),
        'reserved', ?
      FROM credit_accounts
      WHERE tenant_id = ?
        AND subscription_balance + purchased_balance + promotional_balance >= ?
      `
    ).bind(
      reservationId,
      requestId,
      projectId,
      requestedCredits,
      requestedCredits,
      requestedCredits,
      requestedCredits,
      t,
      tenantId,
      requestedCredits
    ),
    c.env.DB.prepare(
      `
      UPDATE credit_accounts
      SET
        promotional_balance = promotional_balance - (
          SELECT promotional_credits FROM credit_reservations WHERE id = ?
        ),
        subscription_balance = subscription_balance - (
          SELECT subscription_credits FROM credit_reservations WHERE id = ?
        ),
        purchased_balance = purchased_balance - (
          SELECT purchased_credits FROM credit_reservations WHERE id = ?
        ),
        updated_at = ?
      WHERE tenant_id = ?
        AND changes() = 1
      `
    ).bind(reservationId, reservationId, reservationId, t, tenantId),
    c.env.DB.prepare(
      `
      INSERT INTO credit_ledger (
        id, tenant_id, credit_account_id, entry_type, source, amount,
        balance_after, reference_type, reference_id, description, created_at
      )
      SELECT
        ?, a.tenant_id, a.id, 'reservation', 'ai_request', -r.reserved_credits,
        a.subscription_balance + a.purchased_balance + a.promotional_balance,
        'credit_reservation', r.id, 'AI credit reservation', ?
      FROM credit_accounts a
      JOIN credit_reservations r ON r.credit_account_id = a.id
      WHERE r.id = ? AND a.tenant_id = ? AND changes() = 1
      `
    ).bind(ledgerId, t, reservationId, tenantId),
  ]);

  if (Number(results[0].meta?.changes || 0) === 1) {
    return { ok: true, reserved: requestedCredits, idempotent: false };
  }

  const racedReservation = await c.env.DB.prepare(
    `SELECT tenant_id, project_id, reserved_credits
     FROM credit_reservations WHERE request_id = ?`
  ).bind(requestId).first<{
    tenant_id: string;
    project_id: string | null;
    reserved_credits: number;
  }>();
  if (
    racedReservation &&
    racedReservation.tenant_id === tenantId &&
    racedReservation.project_id === projectId &&
    Number(racedReservation.reserved_credits) === requestedCredits
  ) {
    return { ok: true, reserved: requestedCredits, idempotent: true };
  }

  const account = await getCreditAccount(c, tenantId);
  if (!account) return { ok: false, code: "NO_CREDIT_ACCOUNT" };
  return {
    ok: false,
    code: "INSUFFICIENT_AI_CREDITS",
    available: totalAvailableCredits(account),
    required: requestedCredits,
  };
}

export async function completeCreditReservation(
  c: AppContext,
  tenantId: string,
  requestId: string,
  actualCredits?: number
): Promise<void> {
  const reservation = await c.env.DB.prepare(
    `SELECT id, reserved_credits, promotional_credits, subscription_credits, purchased_credits
     FROM credit_reservations
     WHERE request_id = ? AND tenant_id = ? AND status = 'reserved'`
  ).bind(requestId, tenantId).first<{
    id: string;
    reserved_credits: number;
    promotional_credits: number;
    subscription_credits: number;
    purchased_credits: number;
  }>();
  if (!reservation) return;

  const settledCredits =
    Number.isSafeInteger(actualCredits) && Number(actualCredits) >= 0
      ? Number(actualCredits)
      : Number(reservation.reserved_credits);
  const refundedCredits = Number(reservation.reserved_credits) - settledCredits;
  const purchasedRefund = Math.min(
    Number(reservation.purchased_credits),
    refundedCredits
  );
  const subscriptionRefund = Math.min(
    Number(reservation.subscription_credits),
    refundedCredits - purchasedRefund
  );
  const promotionalRefund =
    refundedCredits - purchasedRefund - subscriptionRefund;
  const timestamp = now();

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE credit_reservations
       SET status = 'completed', actual_credits = ?, settled_at = ?
       WHERE id = ? AND tenant_id = ? AND status = 'reserved'`
    ).bind(settledCredits, timestamp, reservation.id, tenantId),
    c.env.DB.prepare(
      `UPDATE credit_accounts
       SET promotional_balance = promotional_balance + ?,
           subscription_balance = subscription_balance + ?,
           purchased_balance = purchased_balance + ?,
           total_consumed = total_consumed + ?,
           updated_at = ?
       WHERE id = (SELECT credit_account_id FROM credit_reservations WHERE id = ?)
         AND tenant_id = ? AND changes() = 1`
    ).bind(
      promotionalRefund,
      subscriptionRefund,
      purchasedRefund,
      settledCredits,
      timestamp,
      reservation.id,
      tenantId
    ),
    c.env.DB.prepare(
      `INSERT INTO credit_ledger (
         id, tenant_id, credit_account_id, entry_type, source, amount,
         balance_after, reference_type, reference_id, description, created_at
       )
       SELECT
         ?, a.tenant_id, a.id, 'refund', 'ai_request', ?,
         a.subscription_balance + a.purchased_balance + a.promotional_balance,
         'credit_reservation', r.id, 'Unused AI credit reservation refund', ?
       FROM credit_accounts a
       JOIN credit_reservations r ON r.credit_account_id = a.id
       WHERE r.id = ? AND a.tenant_id = ? AND ? > 0 AND changes() = 1`
    ).bind(
      id("led"),
      refundedCredits,
      timestamp,
      reservation.id,
      tenantId,
      refundedCredits
    ),
    c.env.DB.prepare(
      `INSERT INTO credit_ledger (
         id, tenant_id, credit_account_id, entry_type, source, amount,
         balance_after, reference_type, reference_id, description, created_at
       )
       SELECT
         ?, a.tenant_id, a.id, 'consumption', 'ai_request', 0,
         a.subscription_balance + a.purchased_balance + a.promotional_balance,
         'credit_reservation', r.id, 'AI credit reservation settled', ?
       FROM credit_accounts a
       JOIN credit_reservations r ON r.credit_account_id = a.id
       WHERE r.id = ? AND a.tenant_id = ? AND changes() = 1`
    ).bind(id("led"), timestamp, reservation.id, tenantId),
  ]);
}

export async function refundCreditReservation(
  c: AppContext,
  tenantId: string,
  requestId: string
): Promise<void> {
  const t = now();
  const reservationId = await c.env.DB.prepare(
    `SELECT id FROM credit_reservations
     WHERE request_id = ? AND tenant_id = ? AND status = 'reserved'`
  ).bind(requestId, tenantId).first<{ id: string }>();
  if (!reservationId) return;

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE credit_reservations
       SET status = 'refunded', settled_at = ?
       WHERE id = ? AND tenant_id = ? AND status = 'reserved'`
    ).bind(t, reservationId.id, tenantId),
    c.env.DB.prepare(
      `UPDATE credit_accounts
       SET promotional_balance = promotional_balance + (
             SELECT promotional_credits FROM credit_reservations WHERE id = ?
           ),
           subscription_balance = subscription_balance + (
             SELECT subscription_credits FROM credit_reservations WHERE id = ?
           ),
           purchased_balance = purchased_balance + (
             SELECT purchased_credits FROM credit_reservations WHERE id = ?
           ),
           updated_at = ?
       WHERE id = (SELECT credit_account_id FROM credit_reservations WHERE id = ?)
         AND tenant_id = ? AND changes() = 1`
    ).bind(
      reservationId.id,
      reservationId.id,
      reservationId.id,
      t,
      reservationId.id,
      tenantId
    ),
    c.env.DB.prepare(
      `INSERT INTO credit_ledger (
         id, tenant_id, credit_account_id, entry_type, source, amount,
         balance_after, reference_type, reference_id, description, created_at
       )
       SELECT
         ?, a.tenant_id, a.id, 'refund', 'ai_request', r.reserved_credits,
         a.subscription_balance + a.purchased_balance + a.promotional_balance,
         'credit_reservation', r.id, 'AI credit reservation refund', ?
       FROM credit_accounts a
       JOIN credit_reservations r ON r.credit_account_id = a.id
       WHERE r.id = ? AND a.tenant_id = ? AND changes() = 1`
    ).bind(id("led"), t, reservationId.id, tenantId),
  ]);
}
