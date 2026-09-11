import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCreditAccount, reserveCredits, completeCreditReservation, refundCreditReservation } from "../src/services/credits";

// Opt-in only. Uses the application's SQL against the fixed UAT D1 database.
// Credentials remain in memory; fixtures and cleanup use unique IDs owned by this run.
describe.skipIf(process.env.DLOGIC_UAT_AI_TEST !== "1")("UAT managed AI response", () => {
  const tenant = `uat_ai_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const project = `${tenant}_project`;
  const apiKey = `sk_${crypto.randomUUID().replaceAll("-", "")}`;
  let token: string;
  let created = false;
  const endpoint = "https://api.cloudflare.com/client/v4/accounts/55f76f1c600f103ac0eed0d2c4bf36e9/d1/database/deff70e3-7108-4c5e-86e9-a20df3cc6b36/query";
  async function query(batch: { sql: string; params: any[] }[]) {
    const response = await fetch(endpoint, { method: "POST", headers: {
      Authorization: `Bearer ${token}`, "Content-Type": "application/json",
    }, body: JSON.stringify({ batch }), signal: AbortSignal.timeout(30000) });
    const body = await response.json() as any;
    if (!response.ok || !body.success || body.result.some((r: any) => !r.success)) {
      throw new Error(`UAT D1 query failed (HTTP ${response.status})`);
    }
    return body.result;
  }
  class Statement {
    params: any[] = [];
    constructor(readonly sql: string) {}
    bind(...params: any[]) { this.params = params; return this; }
    async first() { return (await query([this]))[0].results[0] ?? null; }
    async run() { return (await query([this]))[0]; }
  }
  const db = { prepare: (sql: string) => new Statement(sql), batch: query };
  const c = { env: { DB: db } } as any;
  beforeAll(async () => {
    const raw = execFileSync("cmd.exe", ["/c", "pnpm.cmd exec wrangler auth token --json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const credentials = JSON.parse(raw);
    token = credentials.token;
    if (typeof token !== "string" || !token) throw new Error("Wrangler token unavailable");
    await query([
      { sql: "INSERT INTO tenants (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)", params: [tenant, "Disposable credit regression", tenant, Date.now(), Date.now()] },
      { sql: "INSERT INTO projects (id,tenant_id,name,created_at,updated_at) VALUES (?,?,?,?,?)", params: [project, tenant, "Disposable regression", Date.now(), Date.now()] },
    ]);
    created = true;
    await createCreditAccount(c, tenant, 2000000);
    const hash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey))).toString("hex");
    await query([
      { sql: "INSERT INTO subscriptions (id,tenant_id,plan_id,current_period_start,current_period_end,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", params: [tenant,tenant,"plan_free",Date.now()-1000,Date.now()+86400000,Date.now(),Date.now()] },
      { sql: "INSERT INTO api_keys (id,tenant_id,project_id,name,key_prefix,key_hash,created_at) VALUES (?,?,?,?,?,?,?)", params: [tenant,tenant,project,"Disposable AI smoke",apiKey.slice(0,8),hash,Date.now()] },
    ]);
  }, 60000);
  afterAll(async () => {
    if (!created) return;
    await query([
      { sql: "DELETE FROM conversation_intelligence WHERE conversation_id IN (SELECT id FROM conversations WHERE tenant_id=?)", params: [tenant] },
      { sql: "DELETE FROM credit_ledger WHERE tenant_id=?", params: [tenant] },
      { sql: "DELETE FROM credit_reservations WHERE tenant_id=?", params: [tenant] },
      { sql: "DELETE FROM credit_accounts WHERE tenant_id=?", params: [tenant] },
      { sql: "DELETE FROM projects WHERE id=? AND tenant_id=?", params: [project, tenant] },
      { sql: "DELETE FROM tenants WHERE id=?", params: [tenant] },
    ]);
  }, 60000);
  it("returns a managed response and reconciles actual charges", async () => {
    const response = await fetch("https://dlogicai-api-uat.rdproducts-adm1.workers.dev/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": tenant },
      body: JSON.stringify({ input: "Reply with the single word OK.", model: "gemini-2.5-flash-lite", provider: "google", stream: false }),
      signal: AbortSignal.timeout(60000),
    });
    const result = await response.json() as any;
    expect(response.status, result.error?.code || "response status").toBe(200);
    expect(result.model).toBe("gemini-3.5-flash-lite");
    expect(result.output_text.length).toBeGreaterThan(0);
    const usage = await db.prepare("SELECT status,customer_charge_micros,input_tokens,output_tokens FROM usage_events WHERE tenant_id=?").bind(tenant).first();
    expect(usage.status).toBe("completed");
    expect(usage.input_tokens).toBe(result.usage.input_tokens);
    expect(usage.output_tokens).toBe(result.usage.output_tokens);
    expect(usage.customer_charge_micros).toBeGreaterThan(0);
    const account = await db.prepare("SELECT subscription_balance,total_consumed FROM credit_accounts WHERE tenant_id=?").bind(tenant).first();
    expect(account.subscription_balance).toBe(2000000-usage.customer_charge_micros);
    expect(account.total_consumed).toBe(usage.customer_charge_micros);
    expect(await db.prepare("SELECT SUM(amount) AS balance FROM credit_ledger WHERE tenant_id=?").bind(tenant).first())
      .toEqual({ balance: account.subscription_balance });
    expect(await db.prepare("SELECT status,actual_credits FROM credit_reservations WHERE tenant_id=?").bind(tenant).first())
      .toEqual({ status: "completed", actual_credits: usage.customer_charge_micros });
    console.log(JSON.stringify({ model: result.model, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, creditCharge: usage.customer_charge_micros, reconciled: true }));
  }, 120000);
});
