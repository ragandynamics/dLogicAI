import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { AppContext,Env,HonoVariables } from '../types';
import { requireDashboard } from '../utils/auth';
import { id,now,jsonError } from '../utils/common';
import { encryptText,decryptText,sha256 } from '../utils/crypto';
import { auditMutation } from '../services/audit';
import { featureAllowed } from '../services/platform-features';
import { formSchema,formTemplates,validateAnswers } from '../services/forms';
import { takeRate } from '../services/channel-setup';
import { actionSchemas,configSchema } from '../services/business-protocol';

const r=new Hono<{Bindings:Env;Variables:HonoVariables}>();
const base='/v1/projects/:projectId/chat-services/:serviceId/forms';
r.use('*',bodyLimit({maxSize:32768,onError:c=>jsonError(c,'TOO_LARGE','Form request is too large.',413)}));
r.use('*',async(c,next)=>{c.header('Cache-Control','no-store');c.header('Referrer-Policy','no-referrer');await next();});
async function access(c:AppContext){
 const auth=await requireDashboard(c);if(!auth||!['owner','admin'].includes(auth.role))return null;
 if(!['GET','HEAD'].includes(c.req.method)){
  const origin=c.req.header('Origin');const allowed=new Set([new URL(c.req.url).origin,...(c.env.CORS_ORIGINS||'').split(',')]);
  if(origin&&!allowed.has(origin))return null;
 }
 if(!await c.env.DB.prepare('SELECT id FROM chat_services WHERE id=? AND project_id=? AND tenant_id=?').bind(c.req.param('serviceId'),c.req.param('projectId'),auth.tenantId).first())return null;
 return auth;
}
async function owned(c:AppContext,tenant:string){return c.env.DB.prepare('SELECT * FROM interactive_forms WHERE id=? AND tenant_id=? AND project_id=? AND service_id=?').bind(c.req.param('formId'),tenant,c.req.param('projectId'),c.req.param('serviceId')).first<any>();}
async function content(c:AppContext){return c.req.json().catch(()=>null);}
r.get(base,async c=>{
 const auth=await access(c);if(!auth)return jsonError(c,'FORBIDDEN','Owner/admin service access required.',403);
 const forms=await c.env.DB.prepare(`SELECT f.*,(SELECT COUNT(*) FROM form_sessions s WHERE s.form_id=f.id AND s.test=0) AS starts,
 (SELECT COUNT(*) FROM form_sessions s WHERE s.form_id=f.id AND s.test=0 AND s.status='submitted') AS submissions
 FROM interactive_forms f WHERE tenant_id=? AND project_id=? AND service_id=? ORDER BY updated_at DESC LIMIT 100`).bind(auth.tenantId,c.req.param('projectId'),c.req.param('serviceId')).all<any>();
 const templates:Record<string,unknown>={};for(const [key,value] of Object.entries(formTemplates))if(await featureAllowed(c.env.DB,'template.'+key,auth.tenantId))templates[key]=value;
 return c.json({forms:forms.results.map(f=>({...f,draft:JSON.parse(f.draft_json),draft_json:undefined})),templates,available:await featureAllowed(c.env.DB,'forms',auth.tenantId)});
});
r.post(base,async c=>{
 const auth=await access(c);if(!auth)return jsonError(c,'FORBIDDEN','Owner/admin service access required.',403);
 if(!await featureAllowed(c.env.DB,'forms',auth.tenantId))return jsonError(c,'FEATURE_UNAVAILABLE','Interactive Forms is unavailable.',403);
 const definition=formSchema.parse(await content(c)),formId=id('form');
 await auditMutation(c,auth,'form.created','form',formId,c.env.DB.prepare('INSERT INTO interactive_forms(id,tenant_id,project_id,service_id,draft_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(formId,auth.tenantId,c.req.param('projectId'),c.req.param('serviceId'),JSON.stringify(definition),now(),now()));
 return c.json({id:formId,revision:1},201);
});
r.put(base+'/:formId',async c=>{
 const auth=await access(c);if(!auth)return jsonError(c,'FORBIDDEN','Owner/admin service access required.',403);
 const f=await owned(c,auth.tenantId);if(!f)return jsonError(c,'NOT_FOUND','Form not found.',404);
 const v=z.object({revision:z.number().int().positive(),definition:formSchema}).strict().parse(await content(c));
 const result=await auditMutation(c,auth,'form.draft_saved','form',f.id,c.env.DB.prepare('UPDATE interactive_forms SET draft_json=?,revision=revision+1,updated_at=? WHERE id=? AND tenant_id=? AND revision=?').bind(JSON.stringify(v.definition),now(),f.id,auth.tenantId,v.revision));
 if(!result.meta.changes)return jsonError(c,'CONFLICT','This form changed. Reload before saving.',409);
 return c.json({revision:v.revision+1});
});
r.post(base+'/:formId/publish',async c=>{
 const auth=await access(c);if(!auth)return jsonError(c,'FORBIDDEN','Owner/admin service access required.',403);
 const f=await owned(c,auth.tenantId);if(!f)return jsonError(c,'NOT_FOUND','Form not found.',404);
 if(!await featureAllowed(c.env.DB,'forms',auth.tenantId))return jsonError(c,'FEATURE_UNAVAILABLE','Publishing forms is unavailable.',403);
 const {revision}=z.object({revision:z.number().int().positive()}).strict().parse(await content(c));
 formSchema.parse(JSON.parse(f.draft_json));
 if(revision!==f.revision)return jsonError(c,'CONFLICT','Save and reload the current draft.',409);
 await c.env.DB.batch([
  c.env.DB.prepare('INSERT OR IGNORE INTO form_versions(form_id,version,schema_json,created_at) SELECT id,revision,draft_json,? FROM interactive_forms WHERE id=? AND revision=?').bind(now(),f.id,revision),
  c.env.DB.prepare('UPDATE interactive_forms SET published_version=?,updated_at=? WHERE id=? AND revision=?').bind(revision,now(),f.id,revision),
  c.env.DB.prepare("INSERT INTO audit_logs(id,tenant_id,user_id,action,resource_type,resource_id,metadata_json,created_at) SELECT ?,?,?,'form.published','form',?,'{}',? WHERE changes()>0").bind(id('audit'),auth.tenantId,auth.userId,f.id,now())
 ]);
 const latest=await owned(c,auth.tenantId);if(latest.published_version!==revision)return jsonError(c,'CONFLICT','Draft changed during publication.',409);
 return c.json({published_version:revision});
});
r.post(base+'/:formId/status',async c=>{
 const auth=await access(c);if(!auth)return jsonError(c,'FORBIDDEN','Owner/admin service access required.',403);
 const f=await owned(c,auth.tenantId);if(!f)return jsonError(c,'NOT_FOUND','Form not found.',404);
 const {active}=z.object({active:z.boolean()}).strict().parse(await content(c));
 if(active&&(!f.published_version||f.published_version!==f.revision||!await featureAllowed(c.env.DB,'forms',auth.tenantId)))return jsonError(c,'UNAVAILABLE','Publish the current draft and check feature availability before activating.',409);
 await auditMutation(c,auth,'form.'+(active?'activated':'deactivated'),'form',f.id,c.env.DB.prepare('UPDATE interactive_forms SET active=?,updated_at=? WHERE id=? AND tenant_id=?').bind(active?1:0,now(),f.id,auth.tenantId));
 return c.json({active});
});
async function start(c:AppContext,f:any,test:boolean){
 if(!await featureAllowed(c.env.DB,'forms',f.tenant_id))return jsonError(c,'FEATURE_UNAVAILABLE','This form is currently unavailable.',403);
 if(!await takeRate(c,'form-start:'+f.id,100))return jsonError(c,'RATE_LIMIT','Please try again shortly.',429);
 const version=test?f.revision:f.published_version;
 if(test)await c.env.DB.prepare('INSERT OR IGNORE INTO form_versions(form_id,version,schema_json,created_at) VALUES(?,?,?,?)').bind(f.id,version,f.draft_json,now()).run();
 const record=await c.env.DB.prepare('SELECT schema_json FROM form_versions WHERE form_id=? AND version=?').bind(f.id,version).first<{schema_json:string}>();
 if(!record)return jsonError(c,'NOT_FOUND','Published form not found.',404);
 const definition=formSchema.parse(JSON.parse(record.schema_json)),token=id('fs')+id('secret'),sessionId=id('submission'),stamp=now();
 await c.env.DB.prepare('INSERT INTO form_sessions(id,token_hash,form_id,version,tenant_id,project_id,test,created_at,expires_at,retain_until) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(sessionId,await sha256(token),f.id,version,f.tenant_id,f.project_id,test?1:0,stamp,stamp+86400000,stamp+definition.retention_days*86400000).run();
 return c.json({token,id:sessionId,test,definition:{...definition,action:undefined},revision:0,status:'started'},201);
}
r.post(base+'/:formId/test',async c=>{
 const auth=await access(c);if(!auth)return jsonError(c,'FORBIDDEN','Owner/admin service access required.',403);
 const f=await owned(c,auth.tenantId);if(!f)return jsonError(c,'NOT_FOUND','Form not found.',404);return start(c,f,true);
});
r.get('/v1/public-forms/:formId',async c=>{
 const f=await c.env.DB.prepare('SELECT * FROM interactive_forms WHERE id=? AND active=1').bind(c.req.param('formId')).first<any>();
 if(!f||!await featureAllowed(c.env.DB,'forms',f.tenant_id))return jsonError(c,'UNAVAILABLE','This form is unavailable.',404);
 const v=await c.env.DB.prepare('SELECT schema_json FROM form_versions WHERE form_id=? AND version=?').bind(f.id,f.published_version).first<any>();
 const definition=formSchema.parse(JSON.parse(v.schema_json));return c.json({definition:{...definition,action:undefined}});
});
r.post('/v1/public-forms/:formId/start',async c=>{
 const f=await c.env.DB.prepare('SELECT * FROM interactive_forms WHERE id=? AND active=1').bind(c.req.param('formId')).first<any>();
 if(!f)return jsonError(c,'UNAVAILABLE','This form is unavailable.',404);return start(c,f,false);
});
async function session(c:AppContext){
 const token=c.req.header('Authorization')?.replace(/^Bearer /,'');if(!token||token.length>250)return null;
 const s=await c.env.DB.prepare('SELECT s.*,f.active,v.schema_json FROM form_sessions s JOIN interactive_forms f ON f.id=s.form_id JOIN form_versions v ON v.form_id=s.form_id AND v.version=s.version WHERE s.token_hash=? AND s.expires_at>? AND s.retain_until>?').bind(await sha256(token),now(),now()).first<any>();
 if(!s||(!s.test&&!s.active)||!await featureAllowed(c.env.DB,'forms',s.tenant_id,s.created_at))return null;return s;
}
r.get('/v1/form-session',async c=>{
 const s=await session(c);if(!s)return jsonError(c,'UNAVAILABLE','Form session expired or is unavailable.',403);
 return c.json({id:s.id,form_id:s.form_id,test:!!s.test,status:s.status,revision:s.revision,definition:{...JSON.parse(s.schema_json),action:undefined},answers:s.encrypted_answers?JSON.parse(await decryptText(s.encrypted_answers,c.env.MASTER_KEY)):{}});
});
r.post('/v1/form-session/review',async c=>{
 const s=await session(c);if(!s)return jsonError(c,'UNAVAILABLE','Form session expired or is unavailable.',403);
 const value=z.object({revision:z.number().int().min(0),answers:z.unknown()}).strict().parse(await content(c));
 const result=validateAnswers(formSchema.parse(JSON.parse(s.schema_json)),value.answers);
 if(Object.keys(result.errors).length)return c.json({errors:result.errors},422);
 const update=await c.env.DB.prepare("UPDATE form_sessions SET encrypted_answers=?,revision=revision+1,status='reviewed' WHERE id=? AND revision=? AND status!='submitted'").bind(await encryptText(JSON.stringify(result.answers),c.env.MASTER_KEY),s.id,value.revision).run();
 if(!update.meta.changes)return jsonError(c,'CONFLICT','This session changed or was already submitted. Reload to continue.',409);
 return c.json({answers:result.answers,revision:value.revision+1});
});
r.post('/v1/form-session/submit',async c=>{
 const s=await session(c);if(!s)return jsonError(c,'UNAVAILABLE','Form session expired or is unavailable.',403);
 const value=z.object({revision:z.number().int().positive(),confirm:z.literal(true)}).strict().parse(await content(c));
 if(s.revision!==value.revision)return jsonError(c,'CONFLICT','Review the current answers before submitting.',409);
 if(s.status!=='submitted'){
  const changed=await c.env.DB.prepare("UPDATE form_sessions SET status='submitted',submitted_at=? WHERE id=? AND status='reviewed' AND revision=?").bind(now(),s.id,value.revision).run();
  if(!changed.meta.changes){const current=await c.env.DB.prepare('SELECT status FROM form_sessions WHERE id=?').bind(s.id).first<any>();if(current.status!=='submitted')return jsonError(c,'REVIEW_REQUIRED','Review your answers first.',409);}
 }
 return c.json({reference:s.id,test:!!s.test,message:JSON.parse(s.schema_json).confirmation});
});
r.get(base+'/:formId/submissions',async c=>{
 const auth=await access(c);if(!auth)return jsonError(c,'FORBIDDEN','Owner/admin service access required.',403);
 const f=await owned(c,auth.tenantId);if(!f)return jsonError(c,'NOT_FOUND','Form not found.',404);
 const offset=z.coerce.number().int().min(0).max(100000).parse(c.req.query('offset')||0);
 const rows=await c.env.DB.prepare('SELECT id,version,test,status,created_at,submitted_at,retain_until FROM form_sessions WHERE form_id=? AND tenant_id=? ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET ?').bind(f.id,auth.tenantId,offset).all();
 return c.json({records:rows.results.slice(0,50),has_more:rows.results.length>50});
});
r.get(base+'/:formId/submissions/:submissionId',async c=>{
 const auth=await access(c);if(!auth)return jsonError(c,'FORBIDDEN','Owner/admin service access required.',403);
 const f=await owned(c,auth.tenantId);if(!f)return jsonError(c,'NOT_FOUND','Form not found.',404);
 const s=await c.env.DB.prepare("SELECT s.*,v.schema_json FROM form_sessions s JOIN form_versions v ON v.form_id=s.form_id AND v.version=s.version WHERE s.id=? AND s.form_id=? AND s.tenant_id=?").bind(c.req.param('submissionId'),f.id,auth.tenantId).first<any>();
 if(!s)return jsonError(c,'NOT_FOUND','Submission not found.',404);
 await auditMutation(c,auth,'form.answers_viewed','form_submission',s.id,c.env.DB.prepare('UPDATE form_sessions SET revision=revision WHERE id=?').bind(s.id));
 return c.json({id:s.id,status:s.status,test:!!s.test,version:s.version,expired:s.retain_until<=now(),answers:s.status==='submitted'&&s.retain_until>now()&&s.encrypted_answers?JSON.parse(await decryptText(s.encrypted_answers,c.env.MASTER_KEY)):null,definition:JSON.parse(s.schema_json)});
});
r.post(base+'/:formId/submissions/:submissionId/propose',async c=>{
 const auth=await access(c);if(!auth)return jsonError(c,'FORBIDDEN','Owner/admin service access required.',403);
 const f=await owned(c,auth.tenantId);if(!f)return jsonError(c,'NOT_FOUND','Form not found.',404);
 z.object({confirm:z.literal(true)}).strict().parse(await content(c));
 if(!await featureAllowed(c.env.DB,'connector.actions',auth.tenantId))return jsonError(c,'UNAVAILABLE','Connector actions are unavailable.',403);
 const s=await c.env.DB.prepare("SELECT s.*,v.schema_json FROM form_sessions s JOIN form_versions v ON v.form_id=s.form_id AND v.version=s.version WHERE s.id=? AND s.form_id=? AND s.tenant_id=? AND s.test=0 AND s.status='submitted' AND s.retain_until>?").bind(c.req.param('submissionId'),f.id,auth.tenantId,now()).first<any>();
 if(!s)return jsonError(c,'NOT_FOUND','Retained real submission required.',404);
 const mapping=formSchema.parse(JSON.parse(s.schema_json)).action;if(!mapping)return jsonError(c,'NO_ACTION','No connector action was configured for this version.',409);
 const source=await c.env.DB.prepare("SELECT b.config_json FROM business_connectors b JOIN business_connector_bindings a ON a.connector_id=b.id AND a.tenant_id=b.tenant_id AND a.project_id=b.project_id WHERE b.id=? AND b.tenant_id=? AND b.project_id=? AND a.service_id=? AND b.status='active'").bind(mapping.connector_id,auth.tenantId,f.project_id,f.service_id).first<any>();
 if(!source||!configSchema.parse(JSON.parse(source.config_json)).actions.includes(mapping.operation))return jsonError(c,'UNAVAILABLE','The mapped action is no longer permitted for this service.',409);
 const answers=JSON.parse(await decryptText(s.encrypted_answers,c.env.MASTER_KEY));
 const input=actionSchemas[mapping.operation].parse(Object.fromEntries(Object.entries(mapping.input_fields).map(([target,field])=>[target,answers[field]===undefined?undefined:String(answers[field])])));
 const key='form:'+s.id,existing=await c.env.DB.prepare('SELECT id,status FROM business_connector_actions WHERE tenant_id=? AND idempotency_key=?').bind(auth.tenantId,key).first<any>();if(existing)return c.json(existing);
 const action=id('action');await auditMutation(c,auth,'form.action_proposed','business_action',action,c.env.DB.prepare("INSERT OR IGNORE INTO business_connector_actions(id,tenant_id,project_id,connector_id,service_id,operation,encrypted_input,request_hash,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(action,auth.tenantId,f.project_id,mapping.connector_id,f.service_id,mapping.operation,await encryptText(JSON.stringify(input),c.env.MASTER_KEY),await sha256(JSON.stringify(input)),key,now(),now()));
 return c.json(await c.env.DB.prepare('SELECT id,status FROM business_connector_actions WHERE tenant_id=? AND idempotency_key=?').bind(auth.tenantId,key).first());
});
r.onError((error,c)=>error instanceof z.ZodError?c.json({error:{code:'INVALID_FORM',message:error.issues[0]?.message||'Invalid form configuration.'}},400):c.json({error:{code:'FORM_FAILED',message:'Unable to complete the form request. Please retry.'}},503));
export const formRoutes=r;
export async function expireFormAnswers(env:Env){await env.DB.prepare('UPDATE form_sessions SET encrypted_answers=NULL WHERE id IN (SELECT id FROM form_sessions WHERE retain_until<=? AND encrypted_answers IS NOT NULL LIMIT 100)').bind(now()).run();}
