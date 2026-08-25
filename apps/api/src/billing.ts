import { z } from "zod";

export type BillingRouteDeps = {
  requireDashboard: (c: any) => Promise<{ userId: string; tenantId: string; role: string } | null>;
  jsonError: (c: any, code: string, message: string, status?: any) => Response;
  id: (prefix: string) => string;
  now: () => number;
};

function isBillingAdmin(auth: { role: string }) {
  return auth.role === "owner" || auth.role === "admin";
}

function allowedAppUrl(env: any, value: string) {
  try {
    const url = new URL(value);
    const configured = (env.APP_ORIGINS || env.CORS_ORIGINS || "http://localhost:4321,http://127.0.0.1:4321")
      .split(",")
      .map((origin: string) => origin.trim())
      .filter(Boolean);
    return configured.includes(url.origin) && url.pathname === "/dashboard/billing";
  } catch {
    return false;
  }
}

const estimateSchema = z.object({
  plan_id: z.string().min(1),
  forecast: z.record(z.string(), z.number().finite().min(0)).default({}),
  addons: z.record(z.string(), z.number().finite().min(0)).default({}),
  connectors: z.record(z.string(), z.number().finite().min(0)).default({}),
  months: z.number().int().min(1).max(12).default(1),
});

function period(now: number) {
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 1;
  return { start, end };
}

async function stripeFetch(env: any, path: string, init: RequestInit = {}) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${env.STRIPE_SECRET_KEY}`);
  headers.set("Content-Type", "application/x-www-form-urlencoded");
  return fetch(`https://api.stripe.com/v1/${path}`, { ...init, headers });
}

async function stripeSubscriptionPeriod(env: any, subscriptionId: string) {
  if (!subscriptionId) return { start: null, end: null, trialEnd: null };
  const response = await stripeFetch(env, `subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "GET" });
  if (!response.ok) return { start: null, end: null, trialEnd: null };
  const subscription = await response.json<any>();
  return {
    start: Number(subscription.current_period_start || 0) * 1000 || null,
    end: Number(subscription.current_period_end || 0) * 1000 || null,
    trialEnd: Number(subscription.trial_end || 0) * 1000 || null,
  };
}

async function cancelStripeSubscription(env: any, subscriptionId: string) {
  if (!subscriptionId) return true;
  const response = await stripeFetch(env, `subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "DELETE" });
  return response.ok || response.status === 404;
}

function formEncode(values: Record<string, string>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) p.set(k, v);
  return p.toString();
}

async function verifyStripeSignature(rawBody: string, signature: string, secret: string) {
  const parts = signature.split(",");
  const timestamp = parts.find((x) => x.startsWith("t="))?.slice(2);
  const signatures = parts.filter((x) => x.startsWith("v1=")).map((x) => x.slice(3));
  if (!timestamp || signatures.length === 0) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const data = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  const expected = [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
  return signatures.some((candidate) => {
    if (candidate.length !== expected.length) return false;
    let difference = 0;
    for (let i = 0; i < expected.length; i += 1) {
      difference |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return difference === 0;
  });
}

export function registerBillingRoutes(app: any, deps: BillingRouteDeps) {
  app.get("/v1/plans", async (c: any) => {
    const plans = await c.env.DB.prepare(`
      SELECT p.id, p.name, p.monthly_price_cents, p.included_requests,
             p.included_ai_credit_micros, p.max_projects, p.max_api_keys,
              p.max_team_members, p.max_knowledge_bases, p.max_documents,
              p.max_storage_bytes, p.max_vector_chunks, p.features_json
      FROM plans p ORDER BY p.monthly_price_cents ASC
    `).all();
    return c.json({ plans: plans.results });
  });

  app.get("/v1/billing/catalog", async (c: any) => {
    const plans = await c.env.DB.prepare(`
      SELECT p.id, p.name, p.monthly_price_cents, p.included_requests,
             p.included_ai_credit_micros, p.max_projects, p.max_api_keys,
              p.max_team_members, p.max_knowledge_bases, p.max_documents,
              p.max_storage_bytes, p.max_vector_chunks, p.features_json
      FROM plans p ORDER BY p.monthly_price_cents ASC
    `).all();
    const addons = await c.env.DB.prepare(`
      SELECT id, name, description, unit, unit_price_micros, currency, stripe_price_id
      FROM billing_catalog_items WHERE item_type='addon' AND active=1 ORDER BY name
    `).all();
    const connectors = await c.env.DB.prepare(`
      SELECT id, key, name, description FROM connector_catalog WHERE active=1 ORDER BY name
    `).all();
    return c.json({ plans: plans.results, addons: addons.results, connectors: connectors.results });
  });

  app.get("/v1/billing/subscription", async (c: any) => {
    const auth = await deps.requireDashboard(c);
    if (!auth) return deps.jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);

    const subscription = await c.env.DB.prepare(`
            SELECT s.id, s.plan_id, s.status, s.pending_plan_id, s.trial_ends_at,
              pending.name AS pending_plan_name, s.current_period_start,
             s.current_period_end, s.external_customer_id,
             s.external_subscription_id, p.name AS plan_name,
            p.monthly_price_cents, p.included_requests, p.max_projects,
             p.max_api_keys, p.max_knowledge_bases, p.max_documents,
             p.max_storage_bytes, p.max_vector_chunks
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      LEFT JOIN plans pending ON pending.id = s.pending_plan_id
      WHERE s.tenant_id = ?
      LIMIT 1
    `).bind(auth.tenantId).first();
    if (!subscription) return deps.jsonError(c, "SUBSCRIPTION_NOT_FOUND", "No subscription is configured for this tenant.", 404);

    return c.json({ subscription });
  });

  app.post("/v1/billing/subscription/change", async (c: any) => {
    const auth = await deps.requireDashboard(c);
    if (!auth) return deps.jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
    if (!isBillingAdmin(auth)) return deps.jsonError(c, "FORBIDDEN", "Owner or admin access is required for billing changes.", 403);
    const planId = String((await c.req.json().catch(() => ({}))).plan_id || "").trim();
    const plan = await c.env.DB.prepare(`
      SELECT p.id, p.monthly_price_cents,
             COALESCE(
               (SELECT stripe_price_id FROM billing_plan_versions
                WHERE plan_id = p.id AND retired_at IS NULL
                ORDER BY version DESC LIMIT 1),
               p.stripe_price_id
             ) AS stripe_price_id
      FROM plans p WHERE p.id = ?
    `).bind(planId).first();
    if (!plan) return deps.jsonError(c, "PLAN_NOT_FOUND", "The selected plan does not exist.", 404);

    const subscription = await c.env.DB.prepare(`
      SELECT s.id, s.external_subscription_id, p.monthly_price_cents AS current_monthly_price_cents
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      WHERE s.tenant_id = ?
    `).bind(auth.tenantId).first();
    if (!subscription) return deps.jsonError(c, "SUBSCRIPTION_NOT_FOUND", "No subscription is configured for this tenant.", 404);
    if (Number(plan.monthly_price_cents) <= Number(subscription.current_monthly_price_cents)) {
      return deps.jsonError(c, "PLAN_NOT_UPGRADE", "Only plans above the current plan are available for upgrade.", 409);
    }
    if (subscription.external_subscription_id) {
      return c.json({ checkout_required: true, replacement_subscription: true });
    }
    if (Number(plan.monthly_price_cents) > 0) {
      return c.json({ checkout_required: true });
    }

    await c.env.DB.prepare(`UPDATE subscriptions SET plan_id = ?, status = 'active', updated_at = ? WHERE id = ? AND tenant_id = ?`).bind(plan.id, deps.now(), subscription.id, auth.tenantId).run();
    return c.json({ updated: true });
  });

  app.post("/v1/billing/estimate", async (c: any) => {
    const parsed = estimateSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return deps.jsonError(c, "INVALID_REQUEST", "Invalid estimator request.", 400);
    const { plan_id, forecast, addons, connectors, months } = parsed.data;
    const plan = await c.env.DB.prepare(`SELECT * FROM plans WHERE id=? LIMIT 1`).bind(plan_id).first();
    if (!plan) return deps.jsonError(c, "PLAN_NOT_FOUND", "The selected plan does not exist.", 404);

    const base = Number(plan.monthly_price_cents || 0) * 10000;
    const items: any[] = [{ item_type: "subscription", meter_key: null, description: plan.name, quantity: 1, unit_price_micros: base, amount_micros: base }];

    for (const [itemId, qty] of Object.entries(addons)) {
      if (qty <= 0) continue;
      const item = await c.env.DB.prepare(`SELECT * FROM billing_catalog_items WHERE id=? AND item_type='addon' AND active=1`).bind(itemId).first();
      if (!item) continue;
      items.push({ item_type: "addon", meter_key: item.meter_key, description: item.name, quantity: qty, unit_price_micros: Number(item.unit_price_micros), amount_micros: Math.round(qty * Number(item.unit_price_micros)) });
    }

    const planVersion = await c.env.DB.prepare(`
      SELECT id FROM billing_plan_versions WHERE plan_id=? AND retired_at IS NULL ORDER BY version DESC LIMIT 1
    `).bind(plan_id).first();

    if (planVersion) {
      const entitlements = await c.env.DB.prepare(`SELECT * FROM billing_plan_entitlements WHERE plan_version_id=?`).bind(planVersion.id).all();
      for (const e of entitlements.results || []) {
        const actual = Number(forecast[e.meter_key] || 0);
        const included = Number(e.included_units || 0);
        const excess = Math.max(0, actual - included);
        if (excess > 0 && Number(e.overage_enabled)) {
          items.push({ item_type: "overage", meter_key: e.meter_key, description: `${e.meter_key} overage`, quantity: excess, unit_price_micros: Number(e.overage_unit_price_micros), amount_micros: excess * Number(e.overage_unit_price_micros) });
        }
      }
      const connectorEntitlements = await c.env.DB.prepare(`
        SELECT e.*, c.key, c.name FROM billing_connector_entitlements e JOIN connector_catalog c ON c.id=e.connector_id WHERE e.plan_version_id=?
      `).bind(planVersion.id).all();
      for (const e of connectorEntitlements.results || []) {
        const actual = Number(connectors[e.key] || 0);
        const excess = Math.max(0, actual - Number(e.included_api_calls || 0));
        if (excess > 0 && Number(e.overage_enabled)) {
          items.push({ item_type: "connector_overage", meter_key: `connector:${e.key}`, description: `${e.name} API call overage`, quantity: excess, unit_price_micros: Number(e.overage_unit_price_micros), amount_micros: excess * Number(e.overage_unit_price_micros) });
        }
      }
    }

    const monthlyMicros = items.reduce((sum, x) => sum + Number(x.amount_micros || 0), 0);
    return c.json({ currency: "usd", months, monthly: { subtotal_micros: monthlyMicros, subtotal_cents: Math.ceil(monthlyMicros / 10000), items }, forecast: { plan_id, forecast, addons, connectors } });
  });

  app.post("/v1/billing/connectors/:connectorId/usage", async (c: any) => {
    const auth = await deps.requireDashboard(c);
    if (!auth) return deps.jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
    const connectorId = c.req.param("connectorId");
    const body = await c.req.json().catch(() => ({}));
    const quantity = Number(body.quantity);
    const idem = String(c.req.header("Idempotency-Key") || body.idempotency_key || "").trim();
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1_000_000_000) return deps.jsonError(c, "INVALID_REQUEST", "quantity must be a positive integer.", 400);
    if (!idem || idem.length > 200) return deps.jsonError(c, "IDEMPOTENCY_REQUIRED", "Idempotency-Key is required.", 400);
    const connector = await c.env.DB.prepare(`SELECT * FROM connector_catalog WHERE id=? AND active=1`).bind(connectorId).first();
    if (!connector) return deps.jsonError(c, "CONNECTOR_NOT_FOUND", "Connector not found.", 404);
    const { start, end } = period(deps.now());
    const plan = await c.env.DB.prepare(`
      SELECT s.plan_id FROM subscriptions s WHERE s.tenant_id=? ORDER BY s.created_at DESC LIMIT 1
    `).bind(auth.tenantId).first();
    const pv = plan ? await c.env.DB.prepare(`SELECT id FROM billing_plan_versions WHERE plan_id=? AND retired_at IS NULL ORDER BY version DESC LIMIT 1`).bind(plan.plan_id).first() : null;
    const entitlement = pv ? await c.env.DB.prepare(`SELECT * FROM billing_connector_entitlements WHERE plan_version_id=? AND connector_id=?`).bind(pv.id, connectorId).first() : null;
    const already = await c.env.DB.prepare(`SELECT COALESCE(SUM(quantity),0) AS used FROM billing_usage_events WHERE tenant_id=? AND connector_id=? AND period_start=? AND status='recorded'`).bind(auth.tenantId, connectorId, start).first();
    const usedBefore = Number(already?.used || 0);
    const included = Number(entitlement?.included_api_calls || 0);
    const overage = Math.max(0, usedBefore + quantity - included) - Math.max(0, usedBefore - included);
    const unitPrice = Number(entitlement?.overage_unit_price_micros || 0);
    const charge = overage * unitPrice;
    const eventId = deps.id("buse");
    try {
      await c.env.DB.prepare(`INSERT INTO billing_usage_events (id,tenant_id,meter_key,connector_id,quantity,billable_units,unit_price_micros,charge_micros,period_start,period_end,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(eventId, auth.tenantId, `connector:${connector.key}`, connectorId, quantity, overage, unitPrice, charge, start, end, idem, deps.now()).run();
    } catch (e: any) {
      if (String(e?.message || e).toLowerCase().includes("unique")) return c.json({ ok: true, duplicate: true });
      throw e;
    }
    return c.json({ ok: true, event_id: eventId, quantity, included_remaining: Math.max(0, included - usedBefore - quantity), billable_units: overage, charge_micros: charge });
  });

  app.post("/v1/billing/stripe/checkout", async (c: any) => {
    const auth = await deps.requireDashboard(c);
    if (!auth) return deps.jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
    if (!isBillingAdmin(auth)) return deps.jsonError(c, "FORBIDDEN", "Owner or admin access is required for billing changes.", 403);
    if (!c.env.STRIPE_SECRET_KEY) return deps.jsonError(c, "STRIPE_NOT_CONFIGURED", "Stripe checkout is not configured for this environment.", 503);
    const body = await c.req.json().catch(() => ({}));
    const planId = String(body.plan_id || "").trim();
    const trial = body.trial === true;
    if (!planId) return deps.jsonError(c, "INVALID_REQUEST", "plan_id is required.", 400);
    if (trial && planId !== "plan_developer") return deps.jsonError(c, "INVALID_TRIAL_PLAN", "The introductory trial is available on the Developer plan only.", 400);
    const plan = await c.env.DB.prepare(`
      SELECT p.id, p.monthly_price_cents,
             COALESCE(
               (SELECT stripe_price_id FROM billing_plan_versions
                WHERE plan_id = p.id AND retired_at IS NULL
                ORDER BY version DESC LIMIT 1),
               p.stripe_price_id
             ) AS stripe_price_id
      FROM plans p WHERE p.id = ?
    `).bind(planId).first();
    if (!plan) return deps.jsonError(c, "PLAN_NOT_FOUND", "The selected plan does not exist.", 404);
    if (Number(plan.monthly_price_cents) <= 0) return deps.jsonError(c, "FREE_PLAN_CHECKOUT", "Free plans do not require Stripe Checkout.", 409);
    if (!plan.stripe_price_id) return deps.jsonError(c, "STRIPE_PRICE_NOT_CONFIGURED", "No Stripe price is configured for this plan.", 409);
    const tenant = await c.env.DB.prepare(`SELECT id,name,billing_email,external_customer_id FROM tenants WHERE id=?`).bind(auth.tenantId).first();
    let customerId = tenant?.external_customer_id;
    if (!customerId) {
      const customerRes = await stripeFetch(c.env, "customers", { method: "POST", body: formEncode({ name: String(tenant?.name || auth.tenantId), email: String(tenant?.billing_email || "") }) });
      if (!customerRes.ok) return deps.jsonError(c, "STRIPE_ERROR", "Unable to create a Stripe customer.", 502);
      const customer = await customerRes.json<any>();
      customerId = customer.id;
      await c.env.DB.prepare(`UPDATE tenants SET external_customer_id=? WHERE id=?`).bind(customerId, auth.tenantId).run();
    }
    const successUrl = String(body.success_url || "").trim();
    const cancelUrl = String(body.cancel_url || "").trim();
    if (!allowedAppUrl(c.env, successUrl) || !allowedAppUrl(c.env, cancelUrl)) return deps.jsonError(c, "INVALID_URL", "Checkout URLs must point to the configured billing page.", 400);
    const checkoutValues: Record<string, string> = {
      mode: "subscription",
      customer: customerId,
      "line_items[0][price]": String(plan.stripe_price_id),
      "line_items[0][quantity]": "1",
      success_url: successUrl,
      cancel_url: cancelUrl,
      "metadata[tenant_id]": auth.tenantId,
      "metadata[plan_id]": planId,
    };
    if (trial) {
      checkoutValues["subscription_data[trial_period_days]"] = "7";
      checkoutValues["metadata[trial_days]"] = "7";
      checkoutValues["subscription_data[metadata][plan_id]"] = planId;
      checkoutValues["subscription_data[metadata][trial_days]"] = "7";
    }
    const sessionRes = await stripeFetch(c.env, "checkout/sessions", { method: "POST", body: formEncode(checkoutValues) });
    if (!sessionRes.ok) return deps.jsonError(c, "STRIPE_ERROR", "Unable to start Stripe Checkout.", 502);
    const session = await sessionRes.json<any>();
    return c.json({ checkout_url: session.url, session_id: session.id });
  });

  app.post("/v1/billing/stripe/portal", async (c: any) => {
    const auth = await deps.requireDashboard(c);
    if (!auth) return deps.jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
    if (!isBillingAdmin(auth)) return deps.jsonError(c, "FORBIDDEN", "Owner or admin access is required for billing changes.", 403);
    if (!c.env.STRIPE_SECRET_KEY) return deps.jsonError(c, "STRIPE_NOT_CONFIGURED", "Stripe billing portal is not configured for this environment.", 503);
    const body = await c.req.json().catch(() => ({}));
    const returnUrl = String(body.return_url || "").trim();
    if (!allowedAppUrl(c.env, returnUrl)) return deps.jsonError(c, "INVALID_URL", "The return URL must point to the configured billing page.", 400);
    const tenant = await c.env.DB.prepare(`SELECT external_customer_id FROM tenants WHERE id=?`).bind(auth.tenantId).first();
    if (!tenant?.external_customer_id) return deps.jsonError(c, "STRIPE_CUSTOMER_NOT_FOUND", "Stripe customer is not configured.", 409);
    const res = await stripeFetch(c.env, "billing_portal/sessions", { method: "POST", body: formEncode({ customer: tenant.external_customer_id, return_url: returnUrl }) });
    if (!res.ok) return deps.jsonError(c, "STRIPE_ERROR", "Unable to open the Stripe billing portal.", 502);
    const session = await res.json<any>();
    return c.json({ url: session.url });
  });

  app.post("/v1/billing/stripe/checkout/confirm", async (c: any) => {
    const auth = await deps.requireDashboard(c);
    if (!auth) return deps.jsonError(c, "UNAUTHORIZED", "Authentication required.", 401);
    if (!c.env.STRIPE_SECRET_KEY) return deps.jsonError(c, "STRIPE_NOT_CONFIGURED", "Stripe checkout is not configured for this environment.", 503);
    const sessionId = String((await c.req.json().catch(() => ({}))).session_id || "").trim();
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return deps.jsonError(c, "INVALID_REQUEST", "A valid Checkout session ID is required.", 400);

    const sessionResponse = await stripeFetch(c.env, `checkout/sessions/${encodeURIComponent(sessionId)}`, { method: "GET" });
    if (!sessionResponse.ok) return deps.jsonError(c, "STRIPE_ERROR", "Unable to verify the Stripe Checkout session.", 502);
    const session = await sessionResponse.json<any>();
    const tenantId = session.metadata?.tenant_id;
    const planId = session.metadata?.plan_id;
    if (tenantId !== auth.tenantId || !planId) return deps.jsonError(c, "CHECKOUT_TENANT_MISMATCH", "The Checkout session does not belong to this workspace.", 403);
    if (session.status !== "complete") return deps.jsonError(c, "CHECKOUT_INCOMPLETE", "Stripe Checkout has not completed.", 409);

    const trialing = session.metadata?.trial_days === "7";
    const subscriptionPeriod = await stripeSubscriptionPeriod(c.env, session.subscription || "");
    const previousSubscription = await c.env.DB.prepare(`SELECT external_subscription_id FROM subscriptions WHERE tenant_id=?`).bind(auth.tenantId).first();
    if (previousSubscription?.external_subscription_id && previousSubscription.external_subscription_id !== session.subscription) {
      const canceled = await cancelStripeSubscription(c.env, String(previousSubscription.external_subscription_id));
      if (!canceled) return deps.jsonError(c, "STRIPE_ERROR", "Unable to cancel the previous Stripe subscription.", 502);
    }
    await c.env.DB.prepare(`UPDATE subscriptions SET status=?, plan_id=CASE WHEN ? THEN plan_id ELSE ? END, pending_plan_id=CASE WHEN ? THEN ? ELSE NULL END, trial_ends_at=CASE WHEN ? THEN COALESCE(?, trial_ends_at) ELSE NULL END, current_period_start=COALESCE(?, current_period_start), current_period_end=COALESCE(?, current_period_end), external_customer_id=?, external_subscription_id=?, updated_at=? WHERE tenant_id=?`).bind(trialing ? "trialing" : "active", trialing ? 1 : 0, planId, trialing ? 1 : 0, planId, trialing ? 1 : 0, subscriptionPeriod.trialEnd, subscriptionPeriod.start, trialing ? subscriptionPeriod.trialEnd : subscriptionPeriod.end, session.customer || null, session.subscription || null, deps.now(), auth.tenantId).run();
    await c.env.DB.prepare(`UPDATE tenants SET external_customer_id=? WHERE id=?`).bind(session.customer || null, auth.tenantId).run();
    return c.json({ confirmed: true, status: trialing ? "trialing" : "active", plan_id: trialing ? null : planId, pending_plan_id: trialing ? planId : null });
  });

  app.post("/v1/billing/stripe/webhook", async (c: any) => {
    const raw = await c.req.text();
    const signature = c.req.header("Stripe-Signature") || "";
    if (!c.env.STRIPE_WEBHOOK_SECRET || !(await verifyStripeSignature(raw, signature, c.env.STRIPE_WEBHOOK_SECRET))) return deps.jsonError(c, "INVALID_SIGNATURE", "Invalid Stripe webhook signature.", 400);
    const event = JSON.parse(raw);
    try {
      await c.env.DB.prepare(`INSERT INTO stripe_events (id,event_type,payload_json,received_at,status) VALUES (?,?,?,?, 'received')`).bind(event.id, event.type, raw, deps.now()).run();
    } catch (e: any) {
      if (String(e?.message || e).toLowerCase().includes("unique")) {
        const existing = await c.env.DB.prepare(`SELECT status FROM stripe_events WHERE id=?`).bind(event.id).first() as { status: string } | null;
        if (existing?.status !== "failed") return c.json({ received: true, duplicate: true });
        await c.env.DB.prepare(`UPDATE stripe_events SET status='received', error_message=NULL, received_at=? WHERE id=?`).bind(deps.now(), event.id).run();
      } else {
        throw e;
      }
    }
    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const tenantId = session.metadata?.tenant_id;
        const planId = session.metadata?.plan_id;
        if (tenantId && planId) {
          const trialing = session.metadata?.trial_days === "7";
          const subscriptionPeriod = await stripeSubscriptionPeriod(c.env, session.subscription || "");
          const previousSubscription = await c.env.DB.prepare(`SELECT external_subscription_id FROM subscriptions WHERE tenant_id=?`).bind(tenantId).first();
          if (previousSubscription?.external_subscription_id && previousSubscription.external_subscription_id !== session.subscription) {
            const canceled = await cancelStripeSubscription(c.env, String(previousSubscription.external_subscription_id));
            if (!canceled) throw new Error("Unable to cancel the previous Stripe subscription.");
          }
          await c.env.DB.prepare(`UPDATE subscriptions SET status=?, plan_id=CASE WHEN ? THEN plan_id ELSE ? END, pending_plan_id=CASE WHEN ? THEN ? ELSE NULL END, trial_ends_at=CASE WHEN ? THEN COALESCE(?, trial_ends_at) ELSE NULL END, current_period_start=MAX(current_period_start, COALESCE(?, current_period_start)), current_period_end=COALESCE(?, current_period_end), external_customer_id=?, external_subscription_id=?, updated_at=? WHERE tenant_id=?`).bind(trialing ? "trialing" : "active", trialing ? 1 : 0, planId, trialing ? 1 : 0, planId, trialing ? 1 : 0, subscriptionPeriod.trialEnd, subscriptionPeriod.start, trialing ? subscriptionPeriod.trialEnd : subscriptionPeriod.end, session.customer || null, session.subscription || null, deps.now(), tenantId).run();
          await c.env.DB.prepare(`UPDATE tenants SET external_customer_id=? WHERE id=?`).bind(session.customer || null, tenantId).run();
        }
      }
      if (["customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
        const s = event.data.object;
        const status = event.type.endsWith("deleted") ? "canceled" : String(s.status || "active");
        const trialPlanId = s.metadata?.plan_id || null;
        const trialEnd = Number(s.trial_end || 0) * 1000 || null;
        await c.env.DB.prepare(`UPDATE subscriptions SET status=?, plan_id=CASE WHEN ?='active' THEN COALESCE(?, plan_id) ELSE plan_id END, pending_plan_id=CASE WHEN ?='active' OR ?='canceled' THEN NULL ELSE pending_plan_id END, trial_ends_at=CASE WHEN ?='active' OR ?='canceled' THEN NULL ELSE COALESCE(?, trial_ends_at) END, current_period_start=MAX(current_period_start, ?), current_period_end=?, external_customer_id=?, external_subscription_id=?, updated_at=? WHERE external_subscription_id=?`).bind(status, status, trialPlanId, status, status, status, status, trialEnd, Number(s.current_period_start || 0) * 1000, Number(s.current_period_end || 0) * 1000, s.customer || null, s.id || null, deps.now(), s.id).run();
      }
      await c.env.DB.prepare(`UPDATE stripe_events SET processed_at=?, status='processed' WHERE id=?`).bind(deps.now(), event.id).run();
    } catch (e: any) {
      await c.env.DB.prepare(`UPDATE stripe_events SET status='failed', error_message=? WHERE id=?`).bind(String(e?.message || e).slice(0, 1000), event.id).run();
      throw e;
    }
    return c.json({ received: true });
  });
}

