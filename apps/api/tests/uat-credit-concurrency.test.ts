import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCreditAccount, reserveCredits, completeCreditReservation, refundCreditReservation } from "../src/services/credits";

// Opt-in only. Uses the application's SQL against the fixed UAT D1 database.
// Credentials remain in memory; fixtures and cleanup use unique IDs owned by this run.
describe.skipIf(process.env.DLOGIC_UAT_CREDIT_TEST !== "1")("UAT D1 credit concurrency", () => {
  const tenant = `uat_credit_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const project = `${tenant}_project`;
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
    await createCreditAccount(c, tenant, 1000);
  }, 60000);
  afterAll(async () => {
    if (!created) return;
    await query([
      { sql: "DELETE FROM credit_ledger WHERE tenant_id=?", params: [tenant] },
      { sql: "DELETE FROM credit_reservations WHERE tenant_id=?", params: [tenant] },
      { sql: "DELETE FROM credit_accounts WHERE tenant_id=?", params: [tenant] },
      { sql: "DELETE FROM projects WHERE id=? AND tenant_id=?", params: [project, tenant] },
      { sql: "DELETE FROM tenants WHERE id=?", params: [tenant] },
    ]);
  }, 60000);
  it("does not overspend under contention and settles/refunds once", async () => {
    const requests = Array.from({ length: 10 }, (_, i) => `${tenant}_${i}`);
    const results = await Promise.all(requests.map(id => reserveCredits(c, tenant, id, project, 200)));
    const winners = requests.filter((_, i) => results[i].ok);
    expect(winners).toHaveLength(5);
    expect(results.filter(r => !r.ok).every(r => r.code === "INSUFFICIENT_AI_CREDITS")).toBe(true);
    await Promise.all(Array.from({ length: 5 }, () => completeCreditReservation(c, tenant, winners[0], 100)));
    await Promise.all(winners.slice(1).flatMap(id => [refundCreditReservation(c, tenant, id), refundCreditReservation(c, tenant, id)]));
    const account = await db.prepare("SELECT subscription_balance,purchased_balance,promotional_balance,total_consumed FROM credit_accounts WHERE tenant_id=?").bind(tenant).first();
    expect(account).toEqual({ subscription_balance: 900, purchased_balance: 0, promotional_balance: 0, total_consumed: 100 });
    const ledger = await db.prepare("SELECT SUM(amount) AS balance, SUM(CASE WHEN entry_type='consumption' THEN 1 ELSE 0 END) AS consumption_entries FROM credit_ledger WHERE tenant_id=?").bind(tenant).first();
    expect(ledger).toEqual({ balance: 900, consumption_entries: 1 });
    expect(await db.prepare("SELECT COUNT(*) AS pending FROM credit_reservations WHERE tenant_id=? AND status='reserved'").bind(tenant).first()).toEqual({ pending: 0 });
    for (const actual of [0, 200]) {
      const requestId = `${tenant}_exact_${actual}`;
      expect((await reserveCredits(c, tenant, requestId, project, 200)).ok).toBe(true);
      await Promise.all(Array.from({ length: 3 }, () => completeCreditReservation(c, tenant, requestId, actual)));
    }
    expect(await db.prepare("SELECT subscription_balance,total_consumed FROM credit_accounts WHERE tenant_id=?").bind(tenant).first())
      .toEqual({ subscription_balance: 700, total_consumed: 300 });
    expect(await db.prepare("SELECT SUM(amount) AS balance, SUM(CASE WHEN entry_type='consumption' THEN 1 ELSE 0 END) AS entries FROM credit_ledger WHERE tenant_id=?").bind(tenant).first())
      .toEqual({ balance: 700, entries: 3 });
    // Deliberately violate the existing nonnegative trigger; the first write must roll back.
    await expect(query([
      { sql: "UPDATE credit_accounts SET subscription_balance=subscription_balance+1 WHERE tenant_id=?", params: [tenant] },
      { sql: "UPDATE credit_accounts SET subscription_balance=-1 WHERE tenant_id=?", params: [tenant] },
    ])).rejects.toThrow("UAT D1 query failed");
    expect(await db.prepare("SELECT subscription_balance FROM credit_accounts WHERE tenant_id=?").bind(tenant).first())
      .toEqual({ subscription_balance: 700 });
  }, 120000);
});
