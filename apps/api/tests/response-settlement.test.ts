import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("../src/utils/auth", () => ({ requireApi: async (c: any) => {
  const auth = { tenantId: "tenant", userId: "user", role: "owner" };
  c.set("auth", auth);
  c.set("apiProjectId", "project");
  return auth;
} }));
vi.mock("../src/services/dialog", () => ({ prepareDialogRuntime: async () => null }));
vi.mock("../src/services/knowledge", () => ({ retrieveKnowledgeContext: async () => "" }));
vi.mock("../src/services/intelligence", () => ({ recordConversationIntelligence: async () => {} }));
vi.mock("../src/services/providers", async (original) => ({
  ...await original<typeof import("../src/services/providers")>(),
  resolveProvider: async () => ({ mode: "managed", provider: "openai", apiKey: "fixture" }),
  callOpenAI: provider.call,
}));
import { responseRoutes } from "../src/routes/responses";
import { webWidgetRoutes } from "../src/routes/web-widgets";
import { reserveCredits, completeCreditReservation } from "../src/services/credits";

// Real application SQL and migrations on SQLite, with D1's atomic batch contract.
// This is not a substitute for Cloudflare/workerd concurrency verification.
class Statement {
  values: any[] = [];
  constructor(readonly db: DatabaseSync, readonly sql: string) {}
  bind(...values: any[]) { this.values = values; return this; }
  async first() { return this.db.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.values) }; }
  execute() { return { meta: { changes: Number(this.db.prepare(this.sql).run(...this.values).changes) } }; }
  async run() { return this.execute(); }
}
class SqlDb {
  raw = new DatabaseSync(":memory:");
  prepare(sql: string) { return new Statement(this.raw, sql); }
  async batch(statements: Statement[]) {
    this.raw.exec("BEGIN");
    try {
      const results = statements.map((statement) => statement.execute());
      this.raw.exec("COMMIT");
      return results;
    } catch (error) { this.raw.exec("ROLLBACK"); throw error; }
  }
}
let db: SqlDb;
const usageEvent = 'data: {"response":{"usage":{"input_tokens":100,"output_tokens":50}}}\n\n';
function stream(parts = [usageEvent], failure = false) {
  let index = 0;
  return new ReadableStream<Uint8Array>({ pull(controller) {
    if (index < parts.length) controller.enqueue(new TextEncoder().encode(parts[index++]));
    else if (failure) controller.error(new Error("private upstream detail"));
    else controller.close();
  } });
}
function request(key = "request", streaming = true) {
  return responseRoutes.request("/v1/responses", {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ input: "hello", stream: streaming }),
  }, { DB: db, STREAMING_ENABLED: "true" } as never);
}
function row(table: string) { return db.raw.prepare(`SELECT * FROM ${table}`).get() as any; }
function ledgerTotal() { return (db.raw.prepare("SELECT SUM(amount) AS amount FROM credit_ledger").get() as any).amount; }

describe("response route with real credit and usage SQL", () => {
  beforeEach(() => {
    db = new SqlDb();
    for (const file of ["0001_initial.sql", "0002_usage_ledger.sql", "002_billing_and_ai_credits.sql", "0007_atomic_credit_reservations.sql", "032_staff_portals.sql"]) {
      db.raw.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
    }
    db.raw.exec(`
      INSERT INTO tenants (id,name,slug,created_at,updated_at) VALUES ('tenant','Test','test',0,0);
      INSERT INTO projects (id,tenant_id,name,created_at,updated_at) VALUES ('project','tenant','Test',0,0);
      INSERT INTO subscriptions (id,tenant_id,plan_id,current_period_start,current_period_end,created_at,updated_at)
        VALUES ('subscription','tenant','plan_free',0,9999999999,0,0);
      INSERT INTO credit_accounts (id,tenant_id,subscription_balance,created_at,updated_at) VALUES ('account','tenant',10000,0,0);
    `);
    provider.call.mockReset();
    provider.call.mockResolvedValue({ stream: stream(), text: "hello", inputTokens: 100, outputTokens: 50, providerCostMicros: 45 });
  });
  afterEach(() => db.raw.close());
  it('rejects disabled Q&A before provider invocation or credit reservation for streaming and ordinary replies',async()=>{
    db.raw.exec(`INSERT INTO platform_settings(key,value_json,version,updated_by,updated_at) VALUES('feature.chat.qa','{"enabled":false,"stop":"immediate","reason":"Maintenance","disabled_at":1}',1,'admin',1)`);
    for(const streaming of [false,true])expect((await request('disabled-'+streaming,streaming)).status).toBe(403);
    expect(provider.call).not.toHaveBeenCalled();
    expect(db.raw.prepare('SELECT * FROM credit_reservations').all()).toHaveLength(0);
    expect(row('credit_accounts').subscription_balance).toBe(10000);
  });
  it("enforces saved widget limits before invocation and preserves actual token accounting after truncation",async()=>{
    for(const file of ["0006_chat_services.sql","0011_conversation_takeover_and_invitations.sql","027_webchat_telegram_onboarding.sql","002_configurable_billing.sql","033_business_connectors.sql"]) db.raw.exec(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
    db.raw.exec(`INSERT INTO chat_services (id,tenant_id,project_id,name,created_at,updated_at) VALUES ('service','tenant','project','Support',0,0);
      INSERT INTO web_widgets (id,tenant_id,project_id,chat_service_id,config_json,status,created_at,updated_at) VALUES ('widget','tenant','project','service','{"origin":"https://customer.test"}','active',0,0);`);
    db.raw.prepare("INSERT INTO platform_settings VALUES ('channel.web',?,1,'staff',0)").run(JSON.stringify({enabled:true,max_input_characters:100,max_output_tokens:64,max_outputs:1,max_output_characters:100}));
    const headers={"Content-Type":"application/json",Origin:"https://customer.test"};
    const session=await (await webWidgetRoutes.request("/v1/widgets/widget/sessions",{method:"POST",headers,body:"{}"},{DB:db} as any)).json() as any;
    const send=(input:string)=>webWidgetRoutes.request("/v1/widgets/widget/messages",{method:"POST",headers:{...headers,Authorization:"Bearer "+session.token},body:JSON.stringify({input,message_id:crypto.randomUUID()})},{DB:db} as any);
    db.raw.exec(`UPDATE platform_settings SET value_json='{"ai_enabled":false,"support_email":""}' WHERE key='platform'`);
    expect((await send("Hello")).status).toBe(503);expect(provider.call).not.toHaveBeenCalled();expect(row("credit_reservations")).toBeUndefined();
    db.raw.exec(`UPDATE platform_settings SET value_json='{"ai_enabled":true,"support_email":""}' WHERE key='platform'`);
    expect((await send("x".repeat(101))).status).toBe(400);expect(provider.call).not.toHaveBeenCalled();
    provider.call.mockResolvedValue({text:"First paragraph\n\nSecond paragraph",inputTokens:100,outputTokens:50,providerCostMicros:45});
    const response=await send("Hello");expect(response.status).toBe(200);expect(await response.json()).toEqual({output_text:"First paragraph"});
    expect(provider.call.mock.calls[0][6]).toBe(64);
    expect(row("usage_events")).toMatchObject({status:"completed",input_tokens:100,output_tokens:50});
    expect(db.raw.prepare("SELECT content FROM messages WHERE role='assistant'").get()).toEqual({content:"First paragraph"});
  });

  it.each([false, true])("public widget uses real accounting and replay protection (provider failure: %s)", async (failure) => {
    for (const file of ["0006_chat_services.sql", "0011_conversation_takeover_and_invitations.sql", "027_webchat_telegram_onboarding.sql","002_configurable_billing.sql","033_business_connectors.sql"]) db.raw.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
    db.raw.exec(`INSERT INTO chat_services (id,tenant_id,project_id,name,created_at,updated_at) VALUES ('service','tenant','project','Support',0,0);
      INSERT INTO web_widgets (id,tenant_id,project_id,chat_service_id,config_json,status,created_at,updated_at)
      VALUES ('widget','tenant','project','service','{"origin":"https://customer.test"}','active',0,0);`);
    db.raw.prepare("UPDATE web_widgets SET config_json = ? WHERE id = 'widget'").run(JSON.stringify({ origin: 'https://customer.test', conversation_template: 'support', output_template: 'bullets', conversation_instructions: 'Ask for the order reference.' }));
    const headers = { "Content-Type": "application/json", Origin: "https://customer.test" };
    const session = await webWidgetRoutes.request("/v1/widgets/widget/sessions", { method: "POST", headers, body: "{}" }, { DB: db } as never);
    const visitor = await session.json() as any;
    if (failure) provider.call.mockRejectedValue(new Error("private upstream detail"));
    const message = { input: "hello", message_id: crypto.randomUUID() };
    const send = () => webWidgetRoutes.request("/v1/widgets/widget/messages", {
      method: "POST", headers: { ...headers, Authorization: `Bearer ${visitor.token}` }, body: JSON.stringify(message),
    }, { DB: db } as never);
    const response = await send();
    expect(response.status).toBe(failure ? 502 : 200);
    expect(await response.text()).not.toContain("private upstream");
    const balance = row("credit_accounts").subscription_balance;
    expect(row("credit_reservations").status).toBe(failure ? "refunded" : "completed");
    expect(balance).toBe(failure ? 10000 : 10000 - row("credit_reservations").actual_credits);
    expect(ledgerTotal()).toBe(balance - 10000);
    expect((await send()).status).toBe(409);
    expect(provider.call).toHaveBeenCalledTimes(1);
    {
      expect(provider.call.mock.calls[0][3][0].content).toContain('plain-text bullet points');
      expect(provider.call.mock.calls[0][3][0].content).toContain('Ask for the order reference.');
    }
    expect(row("credit_accounts").subscription_balance).toBe(balance);
  });
  it.each([0, 40, 100])("records exactly one settlement when actual charge is %i", async (actual) => {
    const context = { env: { DB: db } } as never;
    await reserveCredits(context, "tenant", "exact", "project", 100);
    await Promise.all([
      completeCreditReservation(context, "tenant", "exact", actual),
      completeCreditReservation(context, "tenant", "exact", actual),
    ]);
    const entries = db.raw.prepare("SELECT entry_type, amount FROM credit_ledger").all();
    expect(entries.filter(entry => entry.entry_type === "consumption")).toHaveLength(1);
    expect(entries.filter(entry => entry.entry_type === "refund")).toHaveLength(actual < 100 ? 1 : 0);
    expect(row("credit_accounts").subscription_balance).toBe(10000 - actual);
    expect(row("credit_accounts").total_consumed).toBe(actual);
    expect(ledgerTotal()).toBe(0 - actual);
  });
  it("settles actual tokens and reconciles the balance and ledger", async () => {
    const response = await request();
    expect(await response.text()).toContain('"type":"response.completed"');
    const usage = row("usage_events"), reservation = row("credit_reservations");
    expect(usage).toMatchObject({ status: "completed", input_tokens: 100, output_tokens: 50 });
    expect(reservation.status).toBe("completed");
    expect(reservation.actual_credits).toBe(usage.customer_charge_micros);
    expect(row("credit_accounts").subscription_balance).toBe(10000 - reservation.actual_credits);
    expect(ledgerTotal()).toBe(-reservation.actual_credits);
  });
  it("matches non-streaming charges", async () => {
    await (await request()).text();
    const charge = row("usage_events").customer_charge_micros;
    expect((await request("nonstream", false)).status).toBe(200);
    expect((db.raw.prepare("SELECT customer_charge_micros FROM usage_events WHERE request_id='nonstream'").get() as any).customer_charge_micros).toBe(charge);
  });
  it("refunds a partial provider failure", async () => {
    provider.call.mockResolvedValue({ stream: stream(['data: {"delta":"hello"}\n\n'], true) });
    await expect((await request()).text()).rejects.toThrow();
    expect(row("usage_events").status).toBe("failed");
    expect(row("credit_reservations").status).toBe("refunded");
    expect(row("credit_accounts").subscription_balance).toBe(10000);
    expect(ledgerTotal()).toBe(0);
  });
  it("refunds when the client cancels", async () => {
    const response = await request();
    await response.body!.cancel();
    expect(row("credit_reservations").status).toBe("refunded");
    expect(row("usage_events").status).toBe("failed");
    expect(ledgerTotal()).toBe(0);
  });
  it("rejects replay without invoking the provider or charging again", async () => {
    await (await request()).text();
    const balance = row("credit_accounts").subscription_balance;
    const response = await request();
    expect(response.status).toBe(409);
    expect(provider.call).toHaveBeenCalledTimes(1);
    expect(row("credit_accounts").subscription_balance).toBe(balance);
  });
  it("reads a final usage event without a trailing newline", async () => {
    provider.call.mockResolvedValue({ stream: stream([usageEvent.trim()]) });
    await (await request()).text();
    expect(row("usage_events").input_tokens).toBe(100);
  });
  it("reassembles usage split across network chunks", async () => {
    provider.call.mockResolvedValue({ stream: stream([usageEvent.slice(0, 25), usageEvent.slice(25)]) });
    await (await request()).text();
    expect(row("usage_events")).toMatchObject({ input_tokens: 100, output_tokens: 50 });
  });
  it("refunds a stream that ends without usage instead of charging invented zero tokens", async () => {
    provider.call.mockResolvedValue({ stream: stream([]) });
    await expect((await request()).text()).rejects.toThrow("AI provider stream failed.");
    expect(row("credit_reservations").status).toBe("refunded");
    expect(ledgerTotal()).toBe(0);
  });
  it("still refunds when upstream cancellation rejects", async () => {
    provider.call.mockResolvedValue({ stream: new ReadableStream({
      cancel() { throw new Error("private cancellation detail"); },
    }) });
    await (await request()).body!.cancel();
    expect(row("credit_reservations").status).toBe("refunded");
    expect(ledgerTotal()).toBe(0);
  });
  it("keeps streaming disabled unless explicitly enabled", async () => {
    const response = await responseRoutes.request("/v1/responses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "hello", stream: true }),
    }, { DB: db, STREAMING_ENABLED: "false" } as never);
    expect(response.status).toBe(400);
    expect(provider.call).not.toHaveBeenCalled();
    expect(row("credit_reservations")).toBeUndefined();
  });
});
