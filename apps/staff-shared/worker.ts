import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { verifyAccess } from "./access";
import { page, script, styles } from "./ui";
import { guardrailsSchema, platformSchema } from "../api/src/services/platform-guardrails";
import { featureCatalog, featurePolicy, featureSchema } from '../api/src/services/platform-features';

export type Portal = "platformadmin" | "operations" | "billing";
type Env = { DB: D1Database; ACCESS_ISSUER?: string; ACCESS_AUD?: string; DATA_BUCKET?: R2Bucket };
type Staff = { email: string; role: Portal };
const filterSchema = z.object({
  days: z.coerce.number().int().min(0).max(365).default(30),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  tenant: z.string().max(200).default(""),
  q: z.string().max(160).default(""),
  status: z.enum(["","submitted","in_progress","waiting","resolved","closed"]).default(""),
  team: z.enum(["","platformadmin","operations","billing"]).default(""),
});
const caseUnion = `SELECT 'problem' AS source, r.id, r.tenant_id, t.name AS tenant_name, r.subject, r.description,
  NULL AS email, NULL AS mobile, r.screenshot_name AS attachment_name, r.created_at, COALESCE(c.status,r.status) AS status,
  COALESCE(c.assigned_team,'operations') AS assigned_team, COALESCE(c.version,0) AS version
  FROM service_requests r JOIN tenants t ON t.id = r.tenant_id
  LEFT JOIN platform_cases c ON c.source = 'problem' AND c.source_id = r.id
  UNION ALL
  SELECT 'contact', r.id, NULL, r.company_name, r.enquiry_type || ': ' || r.name, r.query,
  r.email, r.mobile, NULL, r.created_at, COALESCE(c.status,'submitted'), COALESCE(c.assigned_team,'operations'), COALESCE(c.version,0)
  FROM public_contact_leads r LEFT JOIN platform_cases c ON c.source = 'contact' AND c.source_id = r.id`;
const roles = z.enum(["platformadmin","operations","billing"]);
export function createStaffApp(portal: Portal) {
  const app = new Hono<{ Bindings: Env; Variables: { staff: Staff; requestId: string } }>();
  app.use("*", async (c,next) => {
    c.set("requestId", crypto.randomUUID());
    c.header("X-Request-ID", c.get("requestId"));
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options","nosniff");
    c.header("Referrer-Policy","no-referrer");
    c.header("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    await next();
  });
  app.get("/health", c => c.json({ ok: true }));
  app.get("/app.js", c => c.body(script,200,{"Content-Type":"text/javascript; charset=utf-8"}));
  app.get("/styles.css", c => c.body(styles,200,{"Content-Type":"text/css; charset=utf-8"}));
  app.use("*", bodyLimit({maxSize:16384,onError:c=>c.json({error:"Request is too large."},413)}));
  app.use("*",async(c,next)=>{
    const email=await verifyAccess(c.req.header("Cf-Access-Jwt-Assertion"),c.env);
    if (!email) return c.json({error:"Sign in through the configured Cloudflare Access application. A valid staff identity is required."},401);
    const staff=await c.env.DB.prepare("SELECT email, role FROM platform_staff WHERE email = ? AND active = 1").bind(email).first<Staff>();
    if (!staff || !roles.safeParse(staff.role).success || (staff.role !== portal && staff.role !== "platformadmin")) return c.json({error:"This account does not have access to this staff portal."},403);
    c.set("staff",staff);
    if (!["GET","HEAD","OPTIONS"].includes(c.req.method)) {
      if (c.req.header("Origin") !== new URL(c.req.url).origin || c.req.header("Sec-Fetch-Site") === "cross-site") return c.json({error:"Same-origin requests are required."},403);
      if (!c.req.header("Content-Type")?.toLowerCase().startsWith("application/json")) return c.json({error:"Use JSON for updates."},415);
    }
    await next();
  });
  app.get("/",c=>c.html(page(portal)));
  app.get("/api/me",c=>c.json({staff:c.get("staff"),portal}));
  const canConfigure=portal!=="billing";
  function audit(c: any,action:string,resource:string,details:unknown,onlyNoteId?:string) {
    return c.env.DB.prepare(`INSERT INTO platform_audit (id,actor,role,portal,action,resource,request_id,details_json,created_at)
      SELECT ?,?,?,?,?,?,?,?,? ${onlyNoteId ? "WHERE EXISTS (SELECT 1 FROM platform_case_updates WHERE id = ?)" : ""}`)
      .bind(crypto.randomUUID(),c.get("staff").email,c.get("staff").role,portal,action,resource,c.get("requestId"),JSON.stringify(details),Date.now(),...(onlyNoteId?[onlyNoteId]:[]));
  }
  app.get("/api/overview",async c=>{
    const parsed=filterSchema.safeParse(c.req.query());if(!parsed.success)return c.json({error:"Invalid filters."},400);
    const f=parsed.data,since=f.days===0?0:Date.now()-f.days*86400000;
    const usage=await c.env.DB.prepare(`SELECT COUNT(*) AS requests,
      COALESCE(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END),0) AS completed,
      COALESCE(SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END),0) AS failed,
      COALESCE(SUM(CASE WHEN status='reserved' THEN 1 ELSE 0 END),0) AS pending,
      COALESCE(SUM(CASE WHEN status='completed' THEN input_tokens+output_tokens ELSE 0 END),0) AS tokens
      FROM usage_events WHERE created_at >= ? ${f.tenant?"AND tenant_id = ?":""}`).bind(since,...(f.tenant?[f.tenant]:[])).first();
    const cases=await c.env.DB.prepare(`SELECT status,COUNT(*) AS count FROM (${caseUnion}) WHERE created_at >= ? ${f.tenant?"AND tenant_id = ?":""} GROUP BY status`).bind(since,...(f.tenant?[f.tenant]:[])).all();
    return c.json({usage,cases:cases.results,since,until:Date.now()});
  });
  app.get("/api/records/:view",async c=>{
    const parsed=filterSchema.safeParse(c.req.query());if(!parsed.success)return c.json({error:"Invalid filters."},400);
    const f=parsed.data, since=f.days===0?0:Date.now()-f.days*86400000, view=c.req.param("view");
    let sql="", values: (string|number)[]=[];
    const tenantClause=f.tenant?" AND t.id = ?":"",tenantValues=f.tenant?[f.tenant]:[];
    if(view==="tenants") {
      sql=`SELECT t.id,t.name,t.status,
        (SELECT status FROM subscriptions s WHERE s.tenant_id=t.id ORDER BY s.updated_at DESC LIMIT 1) AS subscription_status,
        COALESCE(a.subscription_balance,0)+COALESCE(a.purchased_balance,0)+COALESCE(a.promotional_balance,0) AS credit_balance
        FROM tenants t LEFT JOIN credit_accounts a ON a.tenant_id=t.id WHERE (t.name LIKE ? OR t.id LIKE ?)${tenantClause} ORDER BY t.name,t.id`;
      values=["%"+f.q+"%","%"+f.q+"%",...tenantValues];
    } else if(view==="usage") {
      sql=`SELECT t.id AS tenant_id,t.name AS tenant,u.provider,u.model,u.billing_mode,u.status,COUNT(*) AS requests,
        SUM(CASE WHEN u.status='completed' THEN u.input_tokens ELSE 0 END) AS input_tokens,
        SUM(CASE WHEN u.status='completed' THEN u.output_tokens ELSE 0 END) AS output_tokens,
        SUM(CASE WHEN u.status='completed' THEN u.customer_charge_micros ELSE 0 END) AS charge_micros
        FROM usage_events u JOIN tenants t ON t.id=u.tenant_id WHERE u.created_at >= ?${tenantClause}
        GROUP BY t.id,t.name,u.provider,u.model,u.billing_mode,u.status ORDER BY requests DESC,t.id,u.provider,u.model,u.billing_mode,u.status`;
      values=[since,...tenantValues];
    } else if(view==="cases") {
      sql=`SELECT source,id,tenant_name,subject,status,assigned_team,created_at FROM (${caseUnion})
        WHERE created_at >= ? AND (subject LIKE ? OR id LIKE ?) ${f.tenant?"AND tenant_id = ?":""} ${f.status?"AND status = ?":""} ${f.team?"AND assigned_team = ?":""}
        ORDER BY created_at DESC,source,id`;
      values=[since,"%"+f.q+"%","%"+f.q+"%",...tenantValues,...(f.status?[f.status]:[]),...(f.team?[f.team]:[])];
    } else if(view==="payments") {
      sql=`SELECT p.id,t.name AS tenant,p.purchase_type,p.credits,p.amount_cents AS amount_minor_units,p.payment_provider,p.payment_reference,p.status,p.created_at
        FROM credit_purchases p JOIN tenants t ON t.id=p.tenant_id WHERE p.created_at >= ?${tenantClause} ORDER BY p.created_at DESC,p.id`;
      values=[since,...tenantValues];
    } else if(view==="invoices") {
      sql=`SELECT i.id,t.name AS tenant,i.currency,i.total_micros,i.status,i.period_start,i.period_end,i.stripe_invoice_id,i.created_at
        FROM billing_invoices i JOIN tenants t ON t.id=i.tenant_id WHERE i.created_at >= ?${tenantClause} ORDER BY i.created_at DESC,i.id`;
      values=[since,...tenantValues];
    } else if(view==="ledger") {
      sql=`SELECT l.id,t.name AS tenant,l.amount,l.entry_type,l.source,l.balance_after,l.reference_id,l.created_at FROM credit_ledger l JOIN tenants t ON t.id=l.tenant_id WHERE l.created_at >= ?${tenantClause} ORDER BY l.created_at DESC,l.id`;
      values=[since,...tenantValues];
    } else if(view==="billing-events") {
      sql="SELECT id,event_type,status,processed_at FROM stripe_events ORDER BY processed_at DESC,id";values=[];
    } else if(view==="audit" && canConfigure) {
      sql="SELECT id,actor,role,portal,action,resource,request_id,created_at FROM platform_audit WHERE created_at >= ? ORDER BY created_at DESC,id DESC";values=[since];
    } else if(view==="tenant-audit" && canConfigure) {
      sql="SELECT id,tenant_id,user_id,action,resource_type,resource_id,created_at FROM audit_logs WHERE created_at >= ?"+(f.tenant?" AND tenant_id = ?":"")+" ORDER BY created_at DESC,id DESC"; values=[since,...tenantValues];
    } else if(view==="system" && canConfigure) {
      sql=`SELECT 'channel_event' AS kind,id,tenant_id,status,error_code AS code,received_at AS created_at FROM channel_events WHERE received_at >= ? ${f.tenant?"AND tenant_id = ?":""}
        UNION ALL SELECT 'delivery',id,tenant_id,status,last_error_code,created_at FROM channel_deliveries WHERE created_at >= ? ${f.tenant?"AND tenant_id = ?":""}
        UNION ALL SELECT 'request',request_id,tenant_id,status,NULL,created_at FROM usage_events WHERE created_at >= ? ${f.tenant?"AND tenant_id = ?":""} ORDER BY created_at DESC,kind,id`;
      values=[since,...tenantValues,since,...tenantValues,since,...tenantValues];
    } else if(view==="staff" && portal==="platformadmin") {
      sql="SELECT email,role,active,created_at FROM platform_staff ORDER BY email";values=[];
    } else return c.json({error:"This view is not available in this portal."},403);
    const rows=await c.env.DB.prepare(sql+" LIMIT 51 OFFSET ?").bind(...values,f.offset).all();
    return c.json({records:rows.results.slice(0,50),has_more:rows.results.length>50});
  });
  app.get("/api/cases/problem/:id/screenshot",async c=>{
    const record=await c.env.DB.prepare("SELECT screenshot_key,screenshot_type FROM service_requests WHERE id=?").bind(c.req.param("id")).first<{screenshot_key:string|null;screenshot_type:string|null}>();
    if(!record?.screenshot_key)return c.json({error:"No screenshot is attached."},404);
    if(!c.env.DATA_BUCKET)return c.json({error:"Attachment storage is not configured."},503);
    const object=await c.env.DATA_BUCKET.get(record.screenshot_key);
    if(!object)return c.json({error:"Attachment not found."},404);
    await c.env.DB.batch([audit(c,"attachment.viewed","problem:"+c.req.param("id"),{})]);
    return c.body(object.body,200,{"Content-Type":["image/png","image/jpeg","image/webp"].includes(record.screenshot_type||"")?record.screenshot_type!:"application/octet-stream","Content-Disposition":"attachment; filename=screenshot"});
  });
  app.get("/api/cases/:source/:id",async c=>{
    if(!["problem","contact"].includes(c.req.param("source")))return c.json({error:"Unknown issue source."},400);
    const record=await c.env.DB.prepare(`SELECT * FROM (${caseUnion}) WHERE source = ? AND id = ?`).bind(c.req.param("source"),c.req.param("id")).first();
    if(!record)return c.json({error:"Issue not found."},404);
    const updates=await c.env.DB.prepare("SELECT actor,assigned_team,status,note,created_at FROM platform_case_updates WHERE source = ? AND source_id = ? ORDER BY created_at DESC,id DESC LIMIT 100").bind(c.req.param("source"),c.req.param("id")).all();
    return c.json({record,updates:updates.results});
  });
  app.post("/api/cases/:source/:id",async c=>{
    const source=c.req.param("source"),sourceId=c.req.param("id");
    if(!["problem","contact"].includes(source))return c.json({error:"Unknown issue source."},400);
    const parsed=z.object({version:z.number().int().min(0),assigned_team:roles,status:z.enum(["submitted","in_progress","waiting","resolved","closed"]),note:z.string().trim().min(1).max(4000)}).strict().safeParse(await c.req.json().catch(()=>null));
    if(!parsed.success)return c.json({error:"A valid assignment, status, version and progress note are required."},400);
    const exists=await c.env.DB.prepare(`SELECT id FROM ${source==="problem"?"service_requests":"public_contact_leads"} WHERE id = ?`).bind(sourceId).first();
    if(!exists)return c.json({error:"Issue not found."},404);
    const data=parsed.data, stamp=Date.now(),noteId=crypto.randomUUID();
    const batch=[
      c.env.DB.prepare("INSERT OR IGNORE INTO platform_cases (source,source_id,updated_at) VALUES (?,?,?)").bind(source,sourceId,stamp),
      c.env.DB.prepare("UPDATE platform_cases SET assigned_team=?,status=?,version=version+1,updated_at=? WHERE source=? AND source_id=? AND version=?").bind(data.assigned_team,data.status,stamp,source,sourceId,data.version),
      c.env.DB.prepare("INSERT INTO platform_case_updates (id,source,source_id,actor,assigned_team,status,note,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()>0").bind(noteId,source,sourceId,c.get("staff").email,data.assigned_team,data.status,data.note,stamp),
      audit(c,"case.updated",source+":"+sourceId,{assigned_team:data.assigned_team,status:data.status,version:data.version+1},noteId),
    ];
    if(source==="problem")batch.push(c.env.DB.prepare("UPDATE service_requests SET status=?,progress_percent=?,updated_at=? WHERE id=? AND EXISTS (SELECT 1 FROM platform_case_updates WHERE id=?)").bind(data.status,["resolved","closed"].includes(data.status)?100:data.status==="submitted"?0:50,stamp,sourceId,noteId));
    const result=await c.env.DB.batch(batch);
    if(!result[1].meta.changes)return c.json({error:"This issue changed since you opened it. Refresh and review the latest update before saving."},409);
    return c.json({saved:true,version:data.version+1});
  });
  app.get("/api/settings",async c=>{
    if(!canConfigure)return c.json({error:"Configuration access is not available to billing."},403);
    const rows=await c.env.DB.prepare("SELECT key,value_json,version,updated_by,updated_at FROM platform_settings WHERE key IN ('platform','channel.web','channel.telegram','channel.whatsapp') ORDER BY key").all<any>();
    return c.json({settings:rows.results.filter(r=>portal==="platformadmin"||r.key!=="platform").map(r=>({...r,value:JSON.parse(r.value_json),value_json:undefined})),defaults:guardrailsSchema.parse({})});
  });
  app.get('/api/features',async c=>{
    if(!canConfigure)return c.json({error:'Feature configuration is unavailable in this portal.'},403);
    const features=await Promise.all(featureCatalog.map(f=>featurePolicy(c.env.DB,f.key)));
    return c.json({features,can_manage:portal==='platformadmin'});
  });
  app.get('/api/features/:feature/tenants/:tenant',async c=>{
    if(!canConfigure)return c.json({error:'Feature access is unavailable in this portal.'},403);
    const feature=c.req.param('feature'),tenant=c.req.param('tenant');
    if(!featureCatalog.some(f=>f.key===feature))return c.json({error:'Unknown feature.'},404);
    if(!await c.env.DB.prepare('SELECT id FROM tenants WHERE id=?').bind(tenant).first())return c.json({error:'Tenant not found.'},404);
    const row=await c.env.DB.prepare('SELECT value_json,version FROM platform_settings WHERE key=?').bind('feature-tenant.'+tenant+'.'+feature).first<{value_json:string;version:number}>();
    return c.json({enabled:row?JSON.parse(row.value_json).enabled:true,version:row?.version||0});
  });
  app.post('/api/features/:feature/tenants/:tenant',async c=>{
    if(portal!=='platformadmin')return c.json({error:'Only system administrators can change tenant feature access.'},403);
    const feature=c.req.param('feature'),tenant=c.req.param('tenant');
    if(!featureCatalog.some(f=>f.key===feature))return c.json({error:'Unknown feature.'},404);
    if(!await c.env.DB.prepare('SELECT id FROM tenants WHERE id=?').bind(tenant).first())return c.json({error:'Tenant not found.'},404);
    const parsed=z.object({enabled:z.boolean(),version:z.number().int().min(0)}).strict().safeParse(await c.req.json().catch(()=>null));
    if(!parsed.success)return c.json({error:'Invalid tenant feature access.'},400);
    const key='feature-tenant.'+tenant+'.'+feature,current=await c.env.DB.prepare('SELECT value_json,version FROM platform_settings WHERE key=?').bind(key).first<{value_json:string;version:number}>();
    if((current?.version||0)!==parsed.data.version)return c.json({error:'Access changed. Reload before saving.'},409);
    const result=await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO platform_settings(key,value_json,version,updated_by,updated_at) VALUES(?,?,1,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,version=platform_settings.version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at WHERE platform_settings.version=?`).bind(key,JSON.stringify({enabled:parsed.data.enabled}),c.get('staff').email,Date.now(),parsed.data.version),
      c.env.DB.prepare('INSERT INTO platform_audit(id,actor,role,portal,action,resource,request_id,details_json,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()>0').bind(crypto.randomUUID(),c.get('staff').email,c.get('staff').role,portal,'feature.tenant_access',key,c.get('requestId'),JSON.stringify({before:current?JSON.parse(current.value_json):null,after:{enabled:parsed.data.enabled}}),Date.now())
    ]);
    if(!result[0].meta.changes)return c.json({error:'Access changed. Reload before saving.'},409);
    return c.json({saved:true,version:parsed.data.version+1});
  });
  app.post("/api/settings/:key",async c=>{
    const key=c.req.param("key");
    const feature=key.startsWith('feature.')?featureCatalog.find(f=>'feature.'+f.key===key):null;
    if(key.startsWith('feature.') && portal!=='platformadmin')return c.json({error:'Only system administrators can change feature availability.'},403);
    if(!canConfigure || (key==="platform" && portal!=="platformadmin"))return c.json({error:"You cannot update this setting."},403);
    if(!feature && !["platform","channel.web","channel.telegram","channel.whatsapp"].includes(key))return c.json({error:"Unknown setting."},400);
    const body=await c.req.json().catch(()=>null);
    const parsed=z.object({version:z.number().int().min(0),value:feature?featureSchema:key==="platform"?platformSchema:guardrailsSchema}).strict().safeParse(body);
    if(!parsed.success)return c.json({error:"Invalid settings. Check the limits and reload if necessary."},400);
    if(feature){
      const value=parsed.data.value as any;
      if(value.enabled && !feature.implemented)return c.json({error:'This feature is not implemented and cannot be activated.'},400);
      if(value.stop==='finish_existing' && key==='feature.connector.actions')return c.json({error:'Connector actions support immediate disable only; queued writes are rechecked.'},400);
      value.disabled_at=value.enabled?0:Date.now();
    }
    const current=await c.env.DB.prepare("SELECT value_json,version FROM platform_settings WHERE key=?").bind(key).first<{value_json:string;version:number}>();
    if(feature && current && !(parsed.data.value as any).enabled){
      const previous=JSON.parse(current.value_json);
      if(!previous.enabled && previous.disabled_at)(parsed.data.value as any).disabled_at=previous.disabled_at;
    }
    if((current?.version||0)!==parsed.data.version)return c.json({error:"Settings changed. Reload before saving."},409);
    const changeId=crypto.randomUUID();
    const result=await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO platform_settings (key,value_json,version,updated_by,updated_at) SELECT ?,?,1,?,? WHERE ?=0
        ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,version=platform_settings.version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at WHERE platform_settings.version=?`)
        .bind(key,JSON.stringify(parsed.data.value),c.get("staff").email,Date.now(),current?0:parsed.data.version,parsed.data.version),
      c.env.DB.prepare("INSERT INTO platform_audit (id,actor,role,portal,action,resource,request_id,details_json,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()>0")
        .bind(changeId,c.get("staff").email,c.get("staff").role,portal,"settings.updated",key,c.get("requestId"),JSON.stringify({before:current?JSON.parse(current.value_json):null,after:parsed.data.value}),Date.now()),
    ]);
    if(!result[0].meta.changes)return c.json({error:"Settings changed. Reload before saving."},409);
    return c.json({saved:true,version:parsed.data.version+1});
  });
  app.onError((_error,c)=>{
    console.error("STAFF_REQUEST_FAILED",{requestId:c.get("requestId"),portal});
    return c.json({error:"Unable to complete the request. Check the deployment bindings and migrations or retry.",request_id:c.get("requestId")},503);
  });
  app.notFound(c=>c.json({error:"Not found."},404));
  return app;
}
