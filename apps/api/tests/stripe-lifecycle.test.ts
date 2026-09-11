import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerBillingRoutes as sourceBillingRoutes } from "../src/billing";
const registerBillingRoutes = process.env.DLOGIC_ISOLATED_UAT_TEST === "1"
  ? (await import(/* @vite-ignore */ new URL("../../../.tmp/uat-isolated/release-test.mjs", import.meta.url).href)).registerBillingRoutes
  : sourceBillingRoutes;
import { subscriptionPeriod } from "../src/stripe-period";

describe("signed Stripe subscription lifecycle", () => {
  let db: DatabaseSync;
  let app: Hono;
  let binding: any;
  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    for (const file of ["0001_initial.sql", "002_configurable_billing.sql", "005_subscription_trial_state.sql"]) {
      db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
    }
    db.exec(`INSERT INTO tenants (id,name,slug,created_at,updated_at) VALUES ('tenant','Fixture','fixture',0,0);
      INSERT INTO subscriptions (id,tenant_id,plan_id,status,current_period_start,current_period_end,external_subscription_id,created_at,updated_at)
      VALUES ('sub','tenant','plan_free','trialing',1000,2000,'sub_fixture',0,0);`);
    binding = { prepare: (sql: string) => ({ bind: (...values: any[]) => ({
      first: async () => db.prepare(sql).get(...values) ?? null,
      run: async () => db.prepare(sql).run(...values),
    }) }) };
    app = new Hono();
    app.onError(() => new Response("Fixture failure", { status: 500 }));
    registerBillingRoutes(app, { requireDashboard: async () => null, id: () => "fixture", now: Date.now,
      jsonError: (c, code, message, status) => c.json({ error: { code, message } }, status), });
  });
  afterEach(() => db.close());
  async function event(type = "customer.subscription.updated", eventId = "evt_fixture", object: any = {}) {
    const raw = JSON.stringify({ id: eventId, type, data: { object: {
      id: "sub_fixture", customer: "cus_fixture", status: "active",
      items: { data: [{ current_period_start: 3000, current_period_end: 6000 }] }, ...object,
    } } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", "fixture_secret").update(`${timestamp}.${raw}`).digest("hex");
    return app.request("/v1/billing/stripe/webhook", { method: "POST", body: raw,
      headers: { "Stripe-Signature": `t=${timestamp},v1=${signature}` },
    }, { DB: binding, STRIPE_WEBHOOK_SECRET: "fixture_secret" });
  }
  function subscription() { return db.prepare("SELECT * FROM subscriptions").get() as any; }
  it("updates item-level periods once and accepts duplicate delivery", async () => {
    expect((await event()).status).toBe(200);
    expect(subscription()).toMatchObject({ status: "active", current_period_start: 3000000, current_period_end: 6000000 });
    const before = subscription();
    expect(await (await event()).json()).toMatchObject({ duplicate: true });
    expect(subscription()).toEqual(before);
  });
  it("cancels without resetting absent period fields to zero", async () => {
    expect((await event("customer.subscription.deleted", "evt_cancel", { items: { data: [] } })).status).toBe(200);
    expect(subscription()).toMatchObject({ status: "canceled", current_period_start: 1000, current_period_end: 2000 });
  });
  it("retries failed processing and then suppresses duplicate effects", async () => {
    db.exec("CREATE TRIGGER fail_fixture BEFORE UPDATE ON subscriptions BEGIN SELECT RAISE(ABORT, 'fixture failure'); END;");
    expect((await event()).status).toBe(500);
    expect(db.prepare("SELECT status FROM stripe_events").get()?.status).toBe("failed");
    db.exec("DROP TRIGGER fail_fixture;");
    expect((await event()).status).toBe(200);
    expect(db.prepare("SELECT status FROM stripe_events").get()?.status).toBe("processed");
    expect(await (await event()).json()).toMatchObject({ duplicate: true });
  });
  it("keeps legacy periods and refuses ambiguous or invalid item periods", () => {
    expect(subscriptionPeriod({ current_period_start: 10, current_period_end: 20 })).toMatchObject({ start: 10000, end: 20000 });
    expect(subscriptionPeriod({ items: { data: [{ current_period_end: 20 }, { current_period_end: 30 }] } }).end).toBeNull();
    expect(subscriptionPeriod({ current_period_end: -1 }).end).toBeNull();
  });
});
