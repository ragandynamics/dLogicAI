import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
const identity=vi.hoisted(()=>({email:"admin@example.test" as string|null}));
vi.mock("../../staff-shared/access",()=>({verifyAccess:async()=>identity.email}));
import { createStaffApp, type Portal } from "../../staff-shared/worker";
import { getGuardrails,limitReply,guardrailsSchema } from "../src/services/platform-guardrails";
import { featureAllowed } from '../src/services/platform-features';
import { script } from '../../staff-shared/ui';
class Statement {
 values:any[]=[];constructor(readonly db:DatabaseSync,readonly sql:string){}
 bind(...values:any[]){this.values=values;return this;}
 async first(){return this.db.prepare(this.sql).get(...this.values)??null;}
 async all(){return {results:this.db.prepare(this.sql).all(...this.values)};}
 async run(){return {meta:{changes:Number(this.db.prepare(this.sql).run(...this.values).changes)}};}
}
class Db {
 raw=new DatabaseSync(":memory:");prepare(sql:string){return new Statement(this.raw,sql);}
 async batch(statements:Statement[]){this.raw.exec("BEGIN");try{const results=[];for(const s of statements)results.push(await s.run());this.raw.exec("COMMIT");return results;}catch(e){this.raw.exec("ROLLBACK");throw e;}}
}
let db:Db;
const call=(portal:Portal,path:string,body?:unknown,origin="https://staff.test")=>createStaffApp(portal).request("https://staff.test"+path,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",Origin:origin},...(body===undefined?{}:{body:JSON.stringify(body)})},{DB:db} as any);
const update={version:0,assigned_team:"billing",status:"in_progress",note:"Investigating the payment reference."};
beforeEach(()=>{
 db=new Db();identity.email="admin@example.test";
 for(const file of ["0001_initial.sql","0002_usage_ledger.sql","002_billing_and_ai_credits.sql","002_configurable_billing.sql","010_service_requests.sql","011_public_contact_leads.sql","013_public_contact_fields.sql","025_service_request_screenshots.sql","018_channel_integrations.sql","019_channel_deliveries.sql","032_staff_portals.sql"]) db.raw.exec(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
 db.raw.exec(`
 INSERT INTO platform_staff VALUES ('admin@example.test','platformadmin',1,0),('ops@example.test','operations',1,0),('billing@example.test','billing',1,0);
 INSERT INTO users (id,email,name,password_hash,created_at,updated_at) VALUES ('u','tenant@example.test','Tenant owner','not-used',0,0);
 INSERT INTO tenants (id,name,slug,created_at,updated_at) VALUES ('t','First','first',0,0),('other','Second','second',0,0);
 INSERT INTO projects (id,tenant_id,name,created_at,updated_at) VALUES ('p','t','Project',0,0);
 INSERT INTO memberships (id,tenant_id,user_id,role,created_at) VALUES ('m','t','u','owner',0);
 `);
 const stamp=Date.now();
 db.raw.prepare("INSERT INTO service_requests (id,tenant_id,user_id,subject,description,created_at,updated_at) VALUES ('problem','t','u','Missing receipt','Please investigate',?,?)").run(stamp,stamp);
 db.raw.prepare("INSERT INTO public_contact_leads (id,name,mobile,email,query,created_at) VALUES ('contact','Contact','123','lead@example.test','Need help',?)").run(stamp);
 db.raw.prepare("INSERT INTO usage_events (id,request_id,tenant_id,project_id,provider,model,billing_mode,input_tokens,output_tokens,provider_cost_micros,customer_charge_micros,status,created_at) VALUES ('use','req','t','p','google','model','managed',12,8,4,6,'completed',?)").run(stamp);
 db.raw.prepare("INSERT INTO usage_events (id,request_id,tenant_id,project_id,provider,model,billing_mode,input_tokens,output_tokens,provider_cost_micros,customer_charge_micros,status,created_at) VALUES ('failed','req-f','t','p','google','model','managed',999,999,999,999,'failed',?)").run(stamp);
});
afterEach(()=>db.raw.close());
describe("separate staff portals",()=>{
 it('ships a parseable staff script with feature navigation',()=>{
  expect(()=>new Function(script)).not.toThrow();
  expect(script).toContain('Feature availability');
 });
 it('scopes tenant feature denial and never lets an allow bypass platform disable',async()=>{
  const path='/api/features/chat.qa/tenants/t';
  expect((await call('operations',path,{enabled:false,version:0})).status).toBe(403);
  expect((await call('platformadmin',path,{enabled:false,version:0})).status).toBe(200);
  expect(await featureAllowed(db as any,'chat.qa','t')).toBe(false);
  expect(await featureAllowed(db as any,'chat.qa','other')).toBe(true);
  expect((await call('platformadmin',path,{enabled:true,version:0})).status).toBe(409);
  expect((await call('platformadmin',path,{enabled:true,version:1})).status).toBe(200);
  await call('platformadmin','/api/settings/feature.chat.qa',{version:0,value:{enabled:false,stop:'immediate',reason:''}});
  expect(await featureAllowed(db as any,'chat.qa','t')).toBe(false);
  expect((await call('platformadmin','/api/features/chat.qa/tenants/missing',{enabled:true,version:0})).status).toBe(404);
 });
 it('enforces feature roles, implementation readiness, retirement and stale updates',async()=>{
  const value={enabled:false,stop:'finish_existing',reason:'Maintenance'};
  expect((await call('operations','/api/settings/feature.chat.qa',{version:0,value})).status).toBe(403);
  expect((await call('billing','/api/features')).status).toBe(403);
  expect((await call('platformadmin','/api/settings/feature.questionnaires',{version:0,value:{...value,enabled:true}})).status).toBe(400);
  const before=Date.now()-1000;
  expect((await call('platformadmin','/api/settings/feature.chat.qa',{version:0,value})).status).toBe(200);
  expect(await featureAllowed(db as any,'chat.qa','t')).toBe(false);
  expect(await featureAllowed(db as any,'chat.qa','t',before)).toBe(true);
  expect(await featureAllowed(db as any,'chat.qa','t',Date.now()+1000)).toBe(false);
  expect((await call('platformadmin','/api/settings/feature.chat.qa',{version:0,value})).status).toBe(409);
  expect((await call('platformadmin','/api/settings/feature.chat.qa',{version:1,value:{...value,stop:'immediate'}})).status).toBe(200);
  expect(await featureAllowed(db as any,'chat.qa','t',before)).toBe(false);
  expect(await featureAllowed(db as any,'template.quiz','t')).toBe(false);
  expect(db.raw.prepare("SELECT * FROM platform_audit WHERE resource='feature.chat.qa'").all()).toHaveLength(2);
 });
 it('rolls back feature changes if audit persistence fails',async()=>{
  db.raw.exec("CREATE TRIGGER reject_features BEFORE INSERT ON platform_audit BEGIN SELECT RAISE(ABORT,'private error'); END");
  expect((await call('platformadmin','/api/settings/feature.chat.qa',{version:0,value:{enabled:false,stop:'immediate',reason:''}})).status).toBe(503);
  expect(await featureAllowed(db as any,'chat.qa','t')).toBe(true);
 });
 it("paginates retained issues and supports all-time lookup",async()=>{
  db.raw.prepare("INSERT INTO public_contact_leads (id,name,mobile,email,query,created_at) VALUES ('old','Old enquiry','','old@example.test','Older request',?)").run(Date.now()-400*86400000);
  expect((await (await call("operations","/api/records/cases?q=old&days=365")).json() as any).records).toHaveLength(0);
  expect((await (await call("operations","/api/records/cases?q=old&days=0")).json() as any).records).toHaveLength(1);
  for(let i=0;i<51;i++)db.raw.prepare("INSERT INTO public_contact_leads (id,name,mobile,email,query,created_at) VALUES (?,?, '','sample@example.test','Sample',?)").run("page-"+i,"Sample "+i,Date.now()-i);
  const first=await (await call("operations","/api/records/cases?days=0")).json() as any;
  const next=await (await call("operations","/api/records/cases?days=0&offset=50")).json() as any;
  expect(first.records).toHaveLength(50);expect(first.has_more).toBe(true);expect(next.records).toHaveLength(4);expect(next.has_more).toBe(false);
  expect(first.records.some((a:any)=>next.records.some((b:any)=>a.source===b.source&&a.id===b.id))).toBe(false);
 });

 it("never promotes tenant owners and honors revocation on the next request",async()=>{
  identity.email="tenant@example.test";expect((await call("platformadmin","/api/me")).status).toBe(403);
  identity.email=null;expect((await call("platformadmin","/api/me")).status).toBe(401);
  identity.email="ops@example.test";expect((await call("operations","/api/me")).status).toBe(200);
  db.raw.exec("UPDATE platform_staff SET active=0 WHERE email='ops@example.test'");
  expect((await call("operations","/api/me")).status).toBe(403);
 });
 it("enforces portal boundaries and capability ceilings for every role",async()=>{
  identity.email="billing@example.test";expect((await call("operations","/api/me")).status).toBe(403);
  expect((await call("billing","/api/settings")).status).toBe(403);
  expect((await call("billing","/api/records/system")).status).toBe(403);
  expect((await call("billing","/api/records/staff")).status).toBe(403);
  identity.email="ops@example.test";expect((await call("platformadmin","/api/me")).status).toBe(403);
  expect((await call("operations","/api/settings/platform",{version:0,value:{ai_enabled:false,support_email:""}})).status).toBe(403);
  identity.email="admin@example.test";expect((await call("billing","/api/settings")).status).toBe(403);
 });
 it("rejects cross-origin writes without changing case state",async()=>{
  expect((await call("operations","/api/cases/problem/problem",update,"https://evil.test")).status).toBe(403);
  expect(db.raw.prepare("SELECT * FROM platform_cases").all()).toHaveLength(0);
 });
 it("assigns a problem to billing, records its update and synchronizes tenant-visible status",async()=>{
  const response=await call("operations","/api/cases/problem/problem",update);expect(response.status).toBe(200);
  expect(db.raw.prepare("SELECT status,progress_percent FROM service_requests WHERE id='problem'").get()).toEqual({status:"in_progress",progress_percent:50});
  const detail=await (await call("billing","/api/cases/problem/problem")).json() as any;
  expect(detail.record).toMatchObject({version:1,assigned_team:"billing",status:"in_progress"});expect(detail.updates[0].note).toBe(update.note);
  expect(db.raw.prepare("SELECT action FROM platform_audit").get()).toEqual({action:"case.updated"});
  expect((await call("operations","/api/cases/problem/problem",update)).status).toBe(409);
  expect(db.raw.prepare("SELECT * FROM platform_case_updates").all()).toHaveLength(1);
  expect((await call("billing","/api/cases/problem/problem",{...update,version:1,status:"resolved",assigned_team:"operations"})).status).toBe(200);
  expect((db.raw.prepare("SELECT progress_percent FROM service_requests").get() as any).progress_percent).toBe(100);
 });
 it("includes contact enquiries and routes them with the same workflow",async()=>{
  expect((await call("billing","/api/cases/contact/contact",{...update,assigned_team:"platformadmin"})).status).toBe(200);
  const list=await (await call("platformadmin","/api/records/cases?team=platformadmin")).json() as any;
  expect(list.records.map((r:any)=>r.source)).toEqual(["contact"]);
  expect((await call("billing","/api/cases/problem/missing",update)).status).toBe(404);
 });
 it("rolls back notes and status if auditing fails",async()=>{
  db.raw.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON platform_audit BEGIN SELECT RAISE(ABORT,'secret database error'); END");
  const response=await call("operations","/api/cases/problem/problem",update);expect(response.status).toBe(503);expect(await response.text()).not.toContain("secret");
  expect(db.raw.prepare("SELECT * FROM platform_case_updates").all()).toHaveLength(0);
  expect((db.raw.prepare("SELECT status FROM service_requests").get() as any).status).toBe("submitted");
 });
 it("updates guardrails with optimistic concurrency and applies global disable",async()=>{
  const value={...guardrailsSchema.parse({}),max_outputs:2,max_input_characters:200};
  expect((await call("operations","/api/settings/channel.web",{version:0,value})).status).toBe(200);
  expect((await getGuardrails(db as any,"web")).max_outputs).toBe(2);
  expect((await call("operations","/api/settings/channel.web",{version:0,value:{...value,max_outputs:10}})).status).toBe(409);
  expect((await call("operations","/api/settings/channel.web",{version:1,value:{...value,max_outputs:0}})).status).toBe(400);
  expect((await call("platformadmin","/api/settings/platform",{version:0,value:{ai_enabled:false,support_email:"support@example.test"}})).status).toBe(200);
  expect((await getGuardrails(db as any,"web")).enabled).toBe(false);
  expect(db.raw.prepare("SELECT * FROM platform_audit").all()).toHaveLength(2);
 });
 it("exercises every dashboard query against the actual migrations and excludes failed usage totals",async()=>{
  for(const view of ["tenants","usage","cases","payments","invoices","ledger","billing-events","audit","tenant-audit","system","staff"]) expect((await call("platformadmin","/api/records/"+view)).status,view).toBe(200);
  const overview=await (await call("platformadmin","/api/overview?tenant=t")).json() as any;expect(overview.usage).toMatchObject({requests:2,completed:1,failed:1,tokens:20});
  const filtered=await (await call("billing","/api/records/usage?tenant=other")).json() as any;expect(filtered.records).toEqual([]);
  expect((await call("platformadmin","/api/records/usage?days=NaN")).status).toBe(400);
 });
 it("limits output items and characters without changing billing tokens",()=>{
  const limits={...guardrailsSchema.parse({}),max_outputs:2,max_output_characters:100};
  expect(limitReply("1. One\n2. Two\n3. Three",limits)).toBe("1. One\n\n2. Two");
  expect(limitReply("One\n\nTwo\n\nThree",limits)).toBe("One\n\nTwo");
  expect(limitReply("x".repeat(101),limits)).toHaveLength(100);
 });
});
