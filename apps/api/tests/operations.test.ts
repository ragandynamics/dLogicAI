import { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ auth: { tenantId: "tenant", userId: "owner", role: "owner" } as any }));
vi.mock("../src/utils/auth", () => ({ requireDashboard: async () => state.auth }));
import { operationsRoutes } from "../src/routes/operations";
import { channelRoutes } from "../src/routes/channels";
import { auditMutation } from "../src/services/audit";
class Statement {
  values: any[] = [];
  constructor(readonly db: DatabaseSync, readonly sql: string) {}
  bind(...values: any[]) { this.values = values; return this; }
  async first() { return this.db.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.values) }; }
  async run() { return { meta: { changes: Number(this.db.prepare(this.sql).run(...this.values).changes) } }; }
}
class SqlDb {
  raw = new DatabaseSync(":memory:");
  prepare(sql: string) { return new Statement(this.raw, sql); }
  async batch(statements: Statement[]) { this.raw.exec("BEGIN"); try { const result=[]; for(const statement of statements) result.push(await statement.run()); this.raw.exec("COMMIT");return result; } catch(error) {this.raw.exec("ROLLBACK");throw error;} }
}
let db: SqlDb;
const request = (view: string) => operationsRoutes.request("/v1/operations/"+view, {}, { DB: db } as any);
beforeEach(() => {
  state.auth={tenantId:"tenant",userId:"owner",role:"owner"};
  db = new SqlDb();
  db.raw.exec(`
    CREATE TABLE platform_settings(key TEXT PRIMARY KEY,value_json TEXT NOT NULL,version INTEGER NOT NULL,updated_by TEXT,updated_at INTEGER NOT NULL);
    CREATE TABLE projects (id TEXT,tenant_id TEXT,name TEXT);
    INSERT INTO projects VALUES ('project','tenant','My project'),('foreign','other','Private project');
    CREATE TABLE users (id TEXT,name TEXT); INSERT INTO users VALUES ('owner','Owner');
    CREATE TABLE audit_logs (id TEXT PRIMARY KEY,tenant_id TEXT,user_id TEXT,action TEXT,resource_type TEXT,resource_id TEXT,metadata_json TEXT,created_at INTEGER);
    CREATE TABLE usage_events (tenant_id TEXT,project_id TEXT,provider TEXT,model TEXT,billing_mode TEXT,status TEXT,input_tokens INTEGER,output_tokens INTEGER,customer_charge_micros INTEGER,created_at INTEGER);
    CREATE TABLE conversations (id TEXT,tenant_id TEXT,project_id TEXT,title TEXT,updated_at INTEGER);
    CREATE TABLE conversation_intelligence (id TEXT,conversation_id TEXT,sentiment TEXT,urgency_score INTEGER,escalation_risk_score INTEGER,created_at INTEGER);
    CREATE TABLE chat_services (id TEXT,tenant_id TEXT,project_id TEXT,name TEXT);
    INSERT INTO chat_services VALUES ('service','tenant','project','Support'),('secret','other','foreign','Secret service');
    CREATE TABLE web_widgets (id TEXT,tenant_id TEXT,project_id TEXT,chat_service_id TEXT,name TEXT,status TEXT,updated_at INTEGER);
    CREATE TABLE channel_installations (id TEXT,tenant_id TEXT,project_id TEXT,chat_service_id TEXT,channel TEXT,external_account_id TEXT,status TEXT,updated_at INTEGER);
    INSERT INTO channel_installations VALUES ('channel','tenant','project','service','telegram','My bot','testing',1),('private','other','foreign','secret','telegram','Private bot','active',1);
  `);
});
afterEach(()=>db.raw.close());
describe("tenant operations reports",()=>{
  it("counts completed tokens only and isolates tenant and project filters",async()=>{
    const insert=db.raw.prepare("INSERT INTO usage_events VALUES (?,?, 'gemini','model','managed',?,?,?,?,?)");
    insert.run("tenant","project","completed",10,20,30,Date.now());
    insert.run("tenant","project","failed",999,999,999,Date.now());
    insert.run("other","foreign","completed",9999,9999,9999,Date.now());
    insert.run("tenant","project","completed",555,555,555,Date.now()-40*86400000);
    const data=await (await request("usage?days=7&project_id=project")).json() as any;
    expect(data.records).toHaveLength(2);
    expect(data.records.reduce((sum:number,r:any)=>sum+r.input_tokens,0)).toBe(10);
    expect(data.records.reduce((sum:number,r:any)=>sum+r.customer_charge_micros,0)).toBe(30);
    expect((await request("usage?project_id=foreign")).status).toBe(404);
    for(const query of ["days=NaN","days=0","days=1.5","offset=-1"]) expect((await request("usage?"+query)).status).toBe(400);
    state.auth=null;expect((await request("usage")).status).toBe(401);
  });
  it("counts the latest signal once per conversation and leaves unanalyzed conversations visible in totals",async()=>{
    db.raw.prepare("INSERT INTO conversations VALUES ('one','tenant','project','Needs help',?),('two','tenant','project','No analysis',?),('private','other','foreign','Private',?)").run(Date.now(),Date.now(),Date.now());
    db.raw.exec("INSERT INTO conversation_intelligence VALUES ('old','one','negative',99,99,1),('new','one','neutral',0,0,2),('private','private','negative',99,99,3)");
    let data=await (await request("analytics")).json() as any;
    expect(data.summary).toEqual({conversations:2,analyzed:1,negative:0,urgent:0,escalation:0});
    expect(data.records).toEqual([]);
    db.raw.exec("INSERT INTO conversation_intelligence VALUES ('newest','one','negative',75,75,3)");
    data=await (await request("analytics")).json() as any;
    expect(data.summary.negative).toBe(1);expect(data.records.map((r:any)=>r.id)).toEqual(["one"]);
  });
  it("restricts audit access, excludes raw metadata and paginates",async()=>{
    for(let i=0;i<52;i++) db.raw.prepare("INSERT INTO audit_logs VALUES (?,'tenant','owner','widget.created','web_widget','w',?,?)").run(String(i),'{"token":"secret"}',Date.now()-i);
    db.raw.prepare("INSERT INTO audit_logs VALUES ('foreign','other','owner','private','secret','secret','{}',?)").run(Date.now());
    for(const role of ["developer","sales_operations","unknown"]) {state.auth.role=role;expect((await request("audit")).status).toBe(403);}
    for(const role of ["owner","admin","billing"]) {
      state.auth.role=role;
      const response=await request("audit");expect(response.status).toBe(200);
      const data=await response.json() as any;expect(data.records).toHaveLength(50);expect(data.has_more).toBe(true);expect(JSON.stringify(data)).not.toContain("secret");
    }
    const page=await (await request("audit?offset=50")).json() as any;expect(page.records).toHaveLength(2);expect(page.has_more).toBe(false);
    expect((await (await request("audit?action=missing")).json() as any).records).toEqual([]);
  });
  it("lists only tenant connections without exposing credentials",async()=>{
    const data=await (await request("channels")).json() as any;
    expect(data.records).toHaveLength(1);expect(data.records[0]).toMatchObject({id:"channel",status:"testing",service_name:"Support"});
  });
  it("deactivates and reactivates without deleting settings; rejects cross-tenant mutation",async()=>{
    const url="/v1/projects/project/chat-services/service/channel-installations/channel/";
    const post=(action:string)=>channelRoutes.request(url+action,{method:"POST"},{DB:db} as any);
    expect((await post("activate")).status).toBe(200);
    expect((await post("deactivate")).status).toBe(200);
    expect((db.raw.prepare("SELECT * FROM channel_installations WHERE id='channel'").get() as any).external_account_id).toBe("My bot");
    state.auth.tenantId="other";expect((await post("activate")).status).toBe(404);
    state.auth.tenantId="tenant";expect((await post("activate")).status).toBe(200);
    expect(db.raw.prepare("SELECT * FROM audit_logs").all()).toHaveLength(3);
  });
  it("rolls back the mutation if audit persistence fails",async()=>{
    db.raw.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
    await expect(auditMutation({env:{DB:db}} as any,state.auth,"channel.activated","channel_installation","channel",db.prepare("UPDATE channel_installations SET status='active' WHERE id='channel'") as any)).rejects.toThrow();
    expect((db.raw.prepare("SELECT status FROM channel_installations WHERE id='channel'").get() as any).status).toBe("testing");
  });
});
