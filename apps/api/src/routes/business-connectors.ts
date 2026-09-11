import { Hono } from 'hono';
import { featureAllowed } from '../services/platform-features';
import { z } from 'zod';
import type { Env,HonoVariables,AppContext } from '../types';
import { requireApi,requireDashboard } from '../utils/auth';
import { encryptText,decryptText,sha256 } from '../utils/crypto';
import { id,now,jsonError } from '../utils/common';
import { configSchema,approvedOrigin,actionSchemas,readLimited,verifySignature } from '../services/business-protocol';
import { installation,ingestRecords,runBusinessOperation,settleBusinessRun } from '../services/business-connectors';
import { auditMutation } from '../services/audit';
import { issueBusinessIdentity } from '../services/business-identity';

export const businessConnectorRoutes=new Hono<{Bindings:Env;Variables:HonoVariables}>();
const r=businessConnectorRoutes;
r.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next();});
const base='/v1/projects/:projectId/business-connectors';
const safeCodes=new Set(['CONNECTOR_ORIGIN_NOT_APPROVED','CONNECTOR_ENTITLEMENT_REQUIRED','CONNECTOR_LIMIT_OR_DUPLICATE','CONNECTOR_BUSY','CONNECTOR_OUTCOME_UNKNOWN','CONNECTOR_PREVIOUS_FAILURE','IDEMPOTENCY_CONFLICT','CONNECTOR_INACTIVE','CONNECTOR_ACTION_FORBIDDEN','CONNECTOR_UNAVAILABLE','HUBSPOT_TICKET_PIPELINE_REQUIRED']);
r.onError((error,c)=>jsonError(c,safeCodes.has(error.message)?error.message:'CONNECTOR_REQUEST_FAILED',safeCodes.has(error.message)?error.message.replaceAll('_',' ').toLowerCase()+'.':'The connector request could not be completed.',409));
async function body(c:AppContext) {return JSON.parse(await readLimited(new Response(c.req.raw.body),64000));}
async function access(c:AppContext,mutate=false) {
  const auth=await requireDashboard(c); if(!auth) return null;
  if(!['owner','admin','developer','billing','sales_operations'].includes(auth.role)) return null;
  if(mutate && !['owner','admin'].includes(auth.role)) return null;
  if(mutate && c.req.header('Origin') && ![...(c.env.CORS_ORIGINS||'').split(','),...(c.env.APP_ORIGINS||'').split(','),new URL(c.req.url).origin].includes(c.req.header('Origin')!)) return null;
  const project=await c.env.DB.prepare('SELECT id FROM projects WHERE id=? AND tenant_id=?').bind(c.req.param('projectId'),auth.tenantId).first();
  return project?auth:null;
}
r.get(base,async c=>{
  const auth=await access(c);if(!auth)return jsonError(c,'FORBIDDEN','Workspace access required.',403);
  const rows=await c.env.DB.prepare('SELECT id,name,config_json,status,tested_at,updated_at FROM business_connectors WHERE tenant_id=? AND project_id=? ORDER BY created_at DESC LIMIT 100').bind(auth.tenantId,c.req.param('projectId')).all<any>();
  const bindings=await c.env.DB.prepare('SELECT connector_id,service_id,live FROM business_connector_bindings WHERE tenant_id=? AND project_id=?').bind(auth.tenantId,c.req.param('projectId')).all();
  const runs=await c.env.DB.prepare('SELECT id,connector_id,operation,status,error_code,attempts,created_at,completed_at FROM business_connector_runs WHERE tenant_id=? AND project_id=? ORDER BY created_at DESC LIMIT 50').bind(auth.tenantId,c.req.param('projectId')).all();
  const actions=await c.env.DB.prepare('SELECT id,connector_id,operation,status,approved_by,created_at FROM business_connector_actions WHERE tenant_id=? AND project_id=? ORDER BY created_at DESC LIMIT 50').bind(auth.tenantId,c.req.param('projectId')).all();
  const usage=await c.env.DB.prepare("SELECT COUNT(*) AS completed,COALESCE(SUM(charge_micros),0) AS charge_micros FROM billing_usage_events WHERE tenant_id=? AND project_id=? AND connector_id='conn_business_api' AND status='recorded'").bind(auth.tenantId,c.req.param('projectId')).first();
  return c.json({connectors:rows.results.map(({config_json,...row})=>({...row,config:JSON.parse(config_json)})),bindings:bindings.results,runs:runs.results,actions:actions.results,usage,can_manage:['owner','admin'].includes(auth.role)});
});
const inputSchema=z.object({name:z.string().trim().min(1).max(100),config:configSchema,token:z.string().min(10).max(4000),webhook_secret:z.string().min(32).max(200)}).strict();
r.post(base,async c=>{
  const auth=await access(c,true);if(!auth)return jsonError(c,'FORBIDDEN','Owner or admin access required.',403);
  const value=inputSchema.parse(await body(c));
  if(value.config.provider==='hubspot') {
    value.config.origin='https://api.hubapi.com';value.config.public_live=false;
    if(value.config.actions.includes('request_booking')) return jsonError(c,'INVALID_REQUEST','HubSpot booking actions are not supported.');
    if(value.config.actions.includes('create_ticket')&&(!value.config.ticket_stage||!value.config.ticket_pipeline))return jsonError(c,'INVALID_REQUEST','Choose the HubSpot ticket pipeline and stage.');
    if(value.config.actions.includes('create_lead')&&!value.config.lead_notes_property)return jsonError(c,'INVALID_REQUEST','Choose the HubSpot contact property for customer requirements.');
  } else value.config.origin=approvedOrigin(value.config.origin,c.env.CONNECTOR_ALLOWED_ORIGINS);
  const connector=id('business');
  await auditMutation(c,auth,'connector.created','business_connector',connector,c.env.DB.prepare(`INSERT INTO business_connectors(id,tenant_id,project_id,name,config_json,encrypted_credentials,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(connector,auth.tenantId,c.req.param('projectId'),value.name,JSON.stringify(value.config),await encryptText(JSON.stringify({token:value.token,webhook_secret:value.webhook_secret}),c.env.MASTER_KEY),now(),now()));
  return c.json({id:connector},201);
});
r.post(base+'/:connectorId/configuration',async c=>{
  const auth=await access(c,true);if(!auth)return jsonError(c,'FORBIDDEN','Owner or admin access required.',403);
  const source=await installation(c,auth.tenantId,c.req.param('projectId')!,c.req.param('connectorId')!);if(!source)return jsonError(c,'NOT_FOUND','Connector not found.',404);
  const value=inputSchema.partial({token:true,webhook_secret:true}).parse(await body(c));
  if(value.config.provider!==JSON.parse(source.config_json).provider)return jsonError(c,'INVALID_REQUEST','Create a new connection to change provider.');
  if(value.config.provider==='hubspot') {
    value.config.origin='https://api.hubapi.com';value.config.public_live=false;
    if(value.config.actions.includes('request_booking')||value.config.actions.includes('create_ticket')&&(!value.config.ticket_stage||!value.config.ticket_pipeline)||value.config.actions.includes('create_lead')&&!value.config.lead_notes_property)return jsonError(c,'INVALID_REQUEST','Complete the HubSpot action mappings.');
  } else value.config.origin=approvedOrigin(value.config.origin,c.env.CONNECTOR_ALLOWED_ORIGINS);
  const credentials=JSON.parse(await decryptText(source.encrypted_credentials,c.env.MASTER_KEY));
  if(value.token)credentials.token=value.token;if(value.webhook_secret)credentials.webhook_secret=value.webhook_secret;
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE business_connectors SET name=?,config_json=?,encrypted_credentials=?,status='configured',tested_at=NULL,updated_at=? WHERE id=? AND tenant_id=?")
      .bind(value.name,JSON.stringify(value.config),await encryptText(JSON.stringify(credentials),c.env.MASTER_KEY),now(),source.id,auth.tenantId),
    c.env.DB.prepare('DELETE FROM business_connector_records WHERE connector_id=?').bind(source.id),
    c.env.DB.prepare('DELETE FROM business_connector_sync WHERE connector_id=?').bind(source.id),
    c.env.DB.prepare("INSERT INTO audit_logs(id,tenant_id,user_id,action,resource_type,resource_id,metadata_json,created_at) VALUES(?,?,?,'connector.configuration_changed','business_connector',?,'{}',?)").bind(id('audit'),auth.tenantId,auth.userId,source.id,now()),
  ]);
  return c.json({ok:true,status:'configured'});
});
r.post(base+'/:connectorId/test',async c=>{
  const auth=await access(c,true);if(!auth)return jsonError(c,'FORBIDDEN','Owner or admin access required.',403);
  const source=await installation(c,auth.tenantId,c.req.param('projectId')!,c.req.param('connectorId')!);if(!source)return jsonError(c,'NOT_FOUND','Connector not found.',404);
  await runBusinessOperation(c,source,'health',{},id('test'));
  await auditMutation(c,auth,'connector.tested','business_connector',source.id,c.env.DB.prepare('UPDATE business_connectors SET tested_at=?,updated_at=? WHERE id=? AND tenant_id=?').bind(now(),now(),source.id,auth.tenantId));
  return c.json({ok:true});
});
r.post(base+'/:connectorId/status',async c=>{
  const auth=await access(c,true);if(!auth)return jsonError(c,'FORBIDDEN','Owner or admin access required.',403);
  const value=z.object({status:z.enum(['active','disabled','configured'])}).strict().parse(await body(c));
  const source=await installation(c,auth.tenantId,c.req.param('projectId')!,c.req.param('connectorId')!);if(!source)return jsonError(c,'NOT_FOUND','Connector not found.',404);
  const result=await auditMutation(c,auth,'connector.'+value.status,'business_connector',source.id,c.env.DB.prepare('UPDATE business_connectors SET status=?,updated_at=? WHERE id=? AND tenant_id=? AND (?!=\'active\' OR tested_at>?)').bind(value.status,now(),source.id,auth.tenantId,value.status,now()-86400000));
  return result.meta.changes?c.json({ok:true}):jsonError(c,'TEST_REQUIRED','Verify the connection before activation.',409);
});
r.post(base+'/:connectorId/bindings',async c=>{
  const auth=await access(c,true);if(!auth)return jsonError(c,'FORBIDDEN','Owner or admin access required.',403);
  const value=z.object({service_id:z.string(),enabled:z.boolean(),live:z.boolean().default(false)}).strict().parse(await body(c));
  const source=await installation(c,auth.tenantId,c.req.param('projectId')!,c.req.param('connectorId')!);
  const service=await c.env.DB.prepare('SELECT id FROM chat_services WHERE id=? AND tenant_id=? AND project_id=?').bind(value.service_id,auth.tenantId,c.req.param('projectId')).first();
  if(!source||!service)return jsonError(c,'NOT_FOUND','Connector or service not found.',404);
  const changed=await auditMutation(c,auth,'connector.binding_changed','business_connector',source.id,value.enabled?
    c.env.DB.prepare(`INSERT INTO business_connector_bindings(tenant_id,project_id,service_id,connector_id,live)
      SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM business_connector_bindings WHERE tenant_id=? AND service_id=?)<3
      OR EXISTS(SELECT 1 FROM business_connector_bindings WHERE tenant_id=? AND service_id=? AND connector_id=?)
      ON CONFLICT(service_id,connector_id) DO UPDATE SET live=excluded.live`).bind(auth.tenantId,source.project_id,value.service_id,source.id,Number(value.live),auth.tenantId,value.service_id,auth.tenantId,value.service_id,source.id):
    c.env.DB.prepare('DELETE FROM business_connector_bindings WHERE tenant_id=? AND service_id=? AND connector_id=?').bind(auth.tenantId,value.service_id,source.id));
  if(value.enabled&&!changed.meta.changes)return jsonError(c,'CONNECTOR_BINDING_LIMIT','Attach at most three business connectors per Chat Service.',409);
  return c.json({ok:true});
});
r.post(base+'/:connectorId/sync',async c=>{
  const auth=await access(c,true);if(!auth)return jsonError(c,'FORBIDDEN','Owner or admin access required.',403);
  const value=z.object({cursor:z.string().max(200).default(''),idempotency_key:z.string().min(8).max(200)}).strict().parse(await body(c));
  const source=await installation(c,auth.tenantId,c.req.param('projectId')!,c.req.param('connectorId')!);if(!source)return jsonError(c,'NOT_FOUND','Connector not found.',404);
  const result:any=await runBusinessOperation(c,source,'sync',{cursor:value.cursor},value.idempotency_key);
  await ingestRecords(c,source,'sync:'+value.idempotency_key,result);
  return c.json({ok:true,received:result.records.length,next_cursor:result.next_cursor||null});
});
r.post('/v1/business-connectors/:connectorId/incoming',async c=>{
  const source=await c.env.DB.prepare("SELECT * FROM business_connectors WHERE id=? AND status='active'").bind(c.req.param('connectorId')).first<any>();
  if(!source)return jsonError(c,'NOT_FOUND','Connector unavailable.',404);
  const timestamp=c.req.header('X-Connector-Timestamp')||'',event=c.req.header('X-Connector-Event')||'';
  if(!/^\d{13}$/.test(timestamp)||Math.abs(now()-Number(timestamp))>300000||!/^[-a-zA-Z0-9_:]{1,200}$/.test(event))return jsonError(c,'UNAUTHORIZED','Invalid event signature.',401);
  const raw=await readLimited(new Response(c.req.raw.body),512000);
  const credentials=JSON.parse(await decryptText(source.encrypted_credentials,c.env.MASTER_KEY));
  if(!await verifySignature(credentials.webhook_secret,`${timestamp}.${event}.${raw}`,c.req.header('X-Connector-Signature')||''))return jsonError(c,'UNAUTHORIZED','Invalid event signature.',401);
  // Native HubSpot webhook payloads are not interchangeable with the signed bridge protocol.
  return c.json(await ingestRecords(c,source,event,JSON.parse(raw)));
});
r.post('/v1/business-identity',async c=>{
  const auth=await requireApi(c);if(!auth)return jsonError(c,'UNAUTHORIZED','A server API key is required.',401);
  const value=z.object({service_id:z.string().min(1),conversation_id:z.string().min(1).max(200),subjects:z.record(z.string(),z.string().min(1).max(200)).refine(v=>Object.keys(v).length>0&&Object.keys(v).length<=3)}).strict().parse(await body(c));
  const project=c.get('apiProjectId')!;
  for(const connector of Object.keys(value.subjects)) {
    const binding=await c.env.DB.prepare('SELECT connector_id FROM business_connector_bindings WHERE tenant_id=? AND project_id=? AND service_id=? AND connector_id=?').bind(auth.tenantId,project,value.service_id,connector).first();
    if(!binding)return jsonError(c,'FORBIDDEN','Connector is not attached to this service.',403);
  }
  return c.json({token:await issueBusinessIdentity(c.env.SESSION_SECRET,{tenant:auth.tenantId,project,service:value.service_id,conversation:value.conversation_id,subjects:value.subjects}),expires_in:300});
});

// Action proposals are created by a trusted tenant backend or reviewed workspace operator.
// A separate, audited approval is required before a queue worker can send business data.
r.post(base+'/:connectorId/actions',async c=>{
  let auth=await access(c,true);
  if(!auth) {const apiAuth=await requireApi(c);if(apiAuth && c.get('apiProjectId')===c.req.param('projectId'))auth=apiAuth;}
  if(!auth)return jsonError(c,'FORBIDDEN','Owner/admin or a project server API key is required.',403);
  const value=z.object({service_id:z.string(),conversation_id:z.string().optional(),operation:z.enum(['create_lead','create_ticket','request_booking']),input:z.unknown(),idempotency_key:z.string().min(8).max(200)}).strict().parse(await body(c));
  const input=actionSchemas[value.operation].parse(value.input);
  const source=await installation(c,auth.tenantId,c.req.param('projectId')!,c.req.param('connectorId')!);
  if(!source||source.status!=='active')return jsonError(c,'NOT_FOUND','Active connector not found.',404);
  const binding=await c.env.DB.prepare('SELECT connector_id FROM business_connector_bindings WHERE tenant_id=? AND project_id=? AND service_id=? AND connector_id=?').bind(auth.tenantId,source.project_id,value.service_id,source.id).first();
  if(!binding||!configSchema.parse(JSON.parse(source.config_json)).actions.includes(value.operation))return jsonError(c,'FORBIDDEN','Action is not enabled for this service.',403);
  if(value.conversation_id && !await c.env.DB.prepare('SELECT id FROM conversations WHERE id=? AND tenant_id=? AND project_id=?').bind(value.conversation_id,auth.tenantId,source.project_id).first())return jsonError(c,'NOT_FOUND','Conversation not found.',404);
  const hash=await sha256(JSON.stringify({connector:source.id,...value,input}));
  const old=await c.env.DB.prepare('SELECT id,request_hash,status FROM business_connector_actions WHERE tenant_id=? AND idempotency_key=?').bind(auth.tenantId,value.idempotency_key).first<any>();
  if(old)return old.request_hash===hash?c.json({id:old.id,status:old.status}):jsonError(c,'IDEMPOTENCY_CONFLICT','Use the original action data.',409);
  const action=id('action');
  await auditMutation(c,auth,'connector.action_proposed','business_action',action,c.env.DB.prepare(`INSERT INTO business_connector_actions(id,tenant_id,project_id,connector_id,service_id,conversation_id,operation,encrypted_input,request_hash,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(action,auth.tenantId,source.project_id,source.id,value.service_id,value.conversation_id||null,value.operation,await encryptText(JSON.stringify(input),c.env.MASTER_KEY),hash,value.idempotency_key,now(),now()));
  return c.json({id:action,status:'pending'},201);
});
r.get(base+'/actions/:actionId',async c=>{
  const auth=await access(c,true);if(!auth)return jsonError(c,'FORBIDDEN','Owner or admin access required.',403);
  const action=await c.env.DB.prepare('SELECT * FROM business_connector_actions WHERE id=? AND tenant_id=? AND project_id=?').bind(c.req.param('actionId'),auth.tenantId,c.req.param('projectId')).first<any>();
  if(!action)return jsonError(c,'NOT_FOUND','Action not found.',404);
  return c.json({id:action.id,status:action.status,operation:action.operation,input:JSON.parse(await decryptText(action.encrypted_input,c.env.MASTER_KEY))});
});
r.post(base+'/actions/:actionId/approve',async c=>{
  const auth=await access(c,true);if(!auth)return jsonError(c,'FORBIDDEN','Owner or admin access required.',403);
  if(!await featureAllowed(c.env.DB,'connector.actions',auth.tenantId))return jsonError(c,'FEATURE_UNAVAILABLE','Business action approval is currently unavailable.',403);
  z.object({confirm:z.literal(true)}).strict().parse(await body(c));
  const action=await c.env.DB.prepare('SELECT * FROM business_connector_actions WHERE id=? AND tenant_id=? AND project_id=?').bind(c.req.param('actionId'),auth.tenantId,c.req.param('projectId')).first<any>();
  if(!action)return jsonError(c,'NOT_FOUND','Action not found.',404);
  if(!c.env.BUSINESS_QUEUE)return jsonError(c,'QUEUE_REQUIRED','Action processing is not configured.',503);
  const changed=await auditMutation(c,auth,'connector.action_approved','business_action',action.id,c.env.DB.prepare("UPDATE business_connector_actions SET status='approved',approved_by=?,approved_at=?,updated_at=? WHERE id=? AND status='pending'").bind(auth.userId,now(),now(),action.id));
  if(!changed.meta.changes&&action.status!=='approved')return jsonError(c,'ACTION_NOT_PENDING','This action cannot be approved.',409);
  await c.env.BUSINESS_QUEUE.send({type:'business.action',id:action.id,tenantId:auth.tenantId});
  return c.json({ok:true,status:'approved'});
});
r.post(base+'/runs/:runId/reconcile',async c=>{
  const auth=await access(c,true);if(!auth)return jsonError(c,'FORBIDDEN','Owner or admin access required.',403);
  const value=z.object({outcome:z.enum(['completed','failed']),external_id:z.string().min(1).max(200),confirm:z.literal(true)}).strict().parse(await body(c));
  const run=await c.env.DB.prepare('SELECT * FROM business_connector_runs WHERE id=? AND tenant_id=? AND project_id=?').bind(c.req.param('runId'),auth.tenantId,c.req.param('projectId')).first<any>();
  if(!run||!['reserved','unknown'].includes(run.status))return jsonError(c,'NOT_FOUND','Pending run not found.',404);
  if(run.created_at>now()-900000)return jsonError(c,'RUN_IN_PROGRESS','Allow 15 minutes before reconciling an uncertain run.',409);
  await settleBusinessRun(c,run.id,{external_id:value.external_id,status:value.outcome},value.outcome==='failed');
  await auditMutation(c,auth,'connector.action_reconciled','business_action',run.id,c.env.DB.prepare("UPDATE business_connector_actions SET status=?,updated_at=? WHERE tenant_id=? AND connector_id=? AND 'action:' || id=? AND status IN ('running','unknown','failed')")
    .bind(value.outcome,now(),auth.tenantId,run.connector_id,run.idempotency_key));
  return c.json({ok:true});
});

export async function processBusinessAction(env:Env,actionId:string,tenant:string) {
  const c={env,get:(key:string)=>key==='auth'?{tenantId:tenant,userId:'connector-worker',role:'system'}:undefined} as unknown as AppContext;
  const action=await env.DB.prepare("SELECT * FROM business_connector_actions WHERE id=? AND tenant_id=? AND status='approved'").bind(actionId,tenant).first<any>();
  if(!action)return;
  const claimed=await env.DB.prepare("UPDATE business_connector_actions SET status='running',updated_at=? WHERE id=? AND status='approved'").bind(now(),action.id).run();
  if(!claimed.meta.changes)return;
  let status='failed';
  try {
    const source=await installation(c,tenant,action.project_id,action.connector_id);
    const binding=await env.DB.prepare('SELECT connector_id FROM business_connector_bindings WHERE tenant_id=? AND project_id=? AND service_id=? AND connector_id=?').bind(tenant,action.project_id,action.service_id,action.connector_id).first();
    if(!source||!binding)throw new Error('CONNECTOR_ACTION_FORBIDDEN');
    const input=actionSchemas[action.operation as keyof typeof actionSchemas].parse(JSON.parse(await decryptText(action.encrypted_input,env.MASTER_KEY)));
    await runBusinessOperation(c,source,action.operation,input,'action:'+action.id);status='completed';
  } catch(error) {status=error instanceof Error && error.message==='CONNECTOR_OUTCOME_UNKNOWN'?'unknown':'failed';}
  await auditMutation(c,{tenantId:tenant,userId:action.approved_by},'connector.action_'+status,'business_action',action.id,
    env.DB.prepare('UPDATE business_connector_actions SET status=?,updated_at=? WHERE id=? AND tenant_id=? AND status=\'running\'').bind(status,now(),action.id,tenant));
}
