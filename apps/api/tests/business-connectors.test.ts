import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
const state=vi.hoisted(()=>({auth:{tenantId:'t',userId:'owner',role:'owner'} as any}));
vi.mock('../src/utils/auth',()=>({requireDashboard:async(c:any)=>{c.set('auth',state.auth);return state.auth;},requireApi:async()=>null}));
import { businessConnectorRoutes,processBusinessAction } from '../src/routes/business-connectors';
import { businessContext,ingestRecords,installation,runBusinessOperation,settleBusinessRun } from '../src/services/business-connectors';
import { configSchema,approvedOrigin,sign,readLimited } from '../src/services/business-protocol';
import { issueBusinessIdentity,verifyBusinessIdentity } from '../src/services/business-identity';
import { encryptText } from '../src/utils/crypto';
import { hubspotRequest } from '../src/integrations/hubspot';
import { scheduledBusinessSync } from '../src/services/business-sync';
import { proposeFlowActions } from '../src/services/business-flow-actions';
class Statement {
  values:any[]=[];constructor(readonly db:DatabaseSync,readonly sql:string){}
  bind(...v:any[]){this.values=v;return this;}
  async first(){return this.db.prepare(this.sql).get(...this.values)||null;}
  async all(){return {results:this.db.prepare(this.sql).all(...this.values)};}
  execute(){return {meta:{changes:Number(this.db.prepare(this.sql).run(...this.values).changes)}};}
  async run(){return this.execute();}
}
class Db {raw=new DatabaseSync(':memory:');prepare(sql:string){return new Statement(this.raw,sql);}async batch(statements:Statement[]){this.raw.exec('BEGIN');try{const r=statements.map(s=>s.execute());this.raw.exec('COMMIT');return r;}catch(e){this.raw.exec('ROLLBACK');throw e;}}}
let db:Db,env:any,c:any,source:any;
const base='/v1/projects/p/business-connectors';
const req=(path:string,body?:unknown)=>businessConnectorRoutes.request(path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})},env);
const config=()=>configSchema.parse({origin:'https://business.example.com',public_live:true,actions:['create_ticket']});
const record=(props:any={})=>({id:'r',visibility:'public',title:'Shipping policy',content:'Shipping takes two days',version:1,updated_at:Date.now(),expires_at:Date.now()+300000,deleted:false,...props});
const rows=(table:string)=>db.raw.prepare('SELECT * FROM '+table).all() as any[];
beforeEach(async()=>{
  db=new Db();state.auth={tenantId:'t',userId:'owner',role:'owner'};
  for(const file of ['0001_initial.sql','0002_usage_ledger.sql','002_billing_and_ai_credits.sql','002_configurable_billing.sql','0006_chat_services.sql','027_webchat_telegram_onboarding.sql','033_business_connectors.sql','032_staff_portals.sql'])db.raw.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  db.raw.exec(`INSERT INTO tenants(id,name,slug,created_at,updated_at) VALUES('t','Tenant','tenant',0,0),('other','Other','other',0,0);
    INSERT INTO projects(id,tenant_id,name,created_at,updated_at) VALUES('p','t','Project',0,0),('foreign','other','Other',0,0);
    INSERT INTO chat_services(id,tenant_id,project_id,name,created_at,updated_at) VALUES('s','t','p','Support',0,0);
    INSERT INTO subscriptions(id,tenant_id,plan_id,current_period_start,current_period_end,created_at,updated_at) VALUES('sub','t','plan_free',0,9999999999999,0,0);
    INSERT INTO billing_plan_versions(id,plan_id,version,effective_at,created_at) VALUES('v','plan_free',1,0,0);
    INSERT INTO billing_connector_entitlements(id,plan_version_id,connector_id,included_api_calls,overage_unit_price_micros,overage_enabled,created_at,updated_at) VALUES('e','v','conn_business_api',1,7,1,0,0);`);
  env={DB:db,MASTER_KEY:'01'.repeat(32),SESSION_SECRET:'identity-fixture-secret',CONNECTOR_ALLOWED_ORIGINS:'https://business.example.com',BUSINESS_QUEUE:{send:vi.fn()}};
  c={env,get:()=>state.auth,header:()=>{}};
  db.raw.prepare('INSERT INTO business_connectors(id,tenant_id,project_id,name,config_json,encrypted_credentials,status,tested_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run('b','t','p','Business',JSON.stringify(config()),await encryptText(JSON.stringify({token:'private-token',webhook_secret:'a'.repeat(32)}),env.MASTER_KEY),'active',Date.now(),0,0);
  db.raw.exec("INSERT INTO business_connector_bindings VALUES('t','p','s','b',0)");
  source=await installation(c,'t','p','b');
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({records:[record()]})));
});
afterEach(()=>{db.raw.close();vi.unstubAllGlobals();});
describe('business connector runtime on real migrations',()=>{
  it('enforces the service connector cap instead of silently ignoring extra bindings',async()=>{
    for(let i=2;i<=4;i++) {
      db.raw.prepare('INSERT INTO business_connectors SELECT ?,tenant_id,project_id,?,config_json,encrypted_credentials,status,tested_at,updated_at,created_at FROM business_connectors WHERE id=\'b\'').run('b'+i,'Business '+i);
      expect((await req(base+'/b'+i+'/bindings',{service_id:'s',enabled:true,live:true})).status).toBe(i===4?409:200);
    }
    expect(rows('business_connector_bindings')).toHaveLength(3);
  });
  it('configuration changes clear indexed data, require verification and preserve audit history',async()=>{
    await ingestRecords(c,source,'first',{records:[record()]});
    expect((await req(base+'/b/configuration',{name:'Updated business',config:config()})).status).toBe(200);
    expect(rows('business_connector_records')).toHaveLength(0);expect(rows('business_connectors')[0]).toMatchObject({status:'configured',tested_at:null});
    expect((await req(base+'/b/status',{status:'active'})).status).toBe(409);
    expect(rows('audit_logs').some(r=>r.action==='connector.configuration_changed')).toBe(true);
  });
  it('proposes a validated dialog outcome once without invoking a business action',async()=>{
    db.raw.exec('CREATE TABLE dialog_outcomes(tenant_id TEXT,flow_version_id TEXT,outcome_key TEXT,actions_json TEXT)');
    db.raw.prepare('INSERT INTO dialog_outcomes VALUES(?,?,?,?)').run('t','flow','completed',JSON.stringify([{type:'business_connector',connector_id:'b',operation:'create_ticket',input_slots:{title:'issue',description:'details'}}]));
    await proposeFlowActions(c,'p','s','conv','flow','completed',{issue:'Help',details:'Please assist'});
    await proposeFlowActions(c,'p','s','conv','flow','completed',{issue:'Help',details:'Please assist'});
    expect(rows('business_connector_actions')).toHaveLength(1);expect(rows('business_connector_actions')[0].status).toBe('pending');expect(fetch).not.toHaveBeenCalled();
  });
  it('isolates sources, customer records, service bindings and widget opt-out',async()=>{
    await ingestRecords(c,source,'one',{records:[record(),record({id:'private',visibility:'customer',subject:'123',content:'Shipping private account detail'}),record({id:'other',visibility:'customer',subject:'456',content:'Shipping someone else'})]});
    const publicText=await businessContext(c,'p','s','Shipping','request');expect(publicText).toContain('two days');expect(publicText).not.toContain('private account');
    const privateText=await businessContext(c,'p','s','Shipping','request',{b:'123'});expect(privateText).toContain('private account');expect(privateText).not.toContain('someone else');
    expect(await businessContext(c,'p','s','Shipping','request',{b:'123'},true)).toBe('');
    expect(await businessContext(c,'foreign','s','Shipping','request')).toBe('');state.auth.tenantId='other';expect(await businessContext(c,'p','s','Shipping','request')).toBe('');
  });
  it('deduplicates incoming batches and prevents stale resurrection after deletions',async()=>{
    await ingestRecords(c,source,'one',{records:[record()]});await ingestRecords(c,source,'one',{records:[record({version:2,content:'injected replay'})]});
    expect(rows('business_connector_records')[0].content).not.toBe('injected replay');
    await ingestRecords(c,source,'delete',{records:[record({version:3,deleted:true})]});await ingestRecords(c,source,'late',{records:[record({version:2})]});
    expect(rows('business_connector_records')[0]).toMatchObject({deleted:1,content:''});expect(await businessContext(c,'p','s','Shipping','request')).toBe('');
  });
  it('rolls back an entire incoming event if a record exceeds limits',async()=>{
    db.raw.exec("CREATE TRIGGER reject_record BEFORE INSERT ON business_connector_records BEGIN SELECT RAISE(ABORT,'reject'); END");
    await expect(ingestRecords(c,source,'one',{records:[record()]})).rejects.toThrow();expect(rows('business_connector_receipts')).toHaveLength(0);
  });
  it('reserves atomically, meters successful calls once and refunds failed reads',async()=>{
    await runBusinessOperation(c,source,'query',{query:'hello'},'one');await runBusinessOperation(c,source,'query',{query:'hello'},'one');
    expect(fetch).toHaveBeenCalledTimes(1);expect(rows('billing_usage_events')).toHaveLength(1);expect(rows('billing_usage_events')[0].charge_micros).toBe(0);
    await expect(runBusinessOperation(c,source,'query',{query:'different'},'one')).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    await runBusinessOperation(c,source,'query',{query:'hello'},'two');expect(rows('billing_usage_events')[1].charge_micros).toBe(7);
    vi.mocked(fetch).mockRejectedValue(new Error('raw private token detail'));await expect(runBusinessOperation(c,source,'query',{},'fail')).rejects.toThrow('CONNECTOR_UNAVAILABLE');
    expect(rows('business_connector_meters')[0]).toMatchObject({used:2,pending:0});expect(JSON.stringify(rows('audit_logs'))).not.toContain('private token');
  });
  it('admits only one competing call at the hard limit',async()=>{
    db.raw.exec('UPDATE billing_connector_entitlements SET hard_limit=1');
    const results=await Promise.allSettled(Array.from({length:5},(_,i)=>runBusinessOperation(c,source,'query',{},'call'+i)));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(fetch).toHaveBeenCalledTimes(1);expect(rows('business_connector_meters')[0]).toMatchObject({used:1,pending:0});
  });
  it('holds an ambiguous write and reconciles it without a second external call',async()=>{
    vi.mocked(fetch).mockRejectedValue(new Error('timeout'));
    await expect(runBusinessOperation(c,source,'create_ticket',{title:'Ticket',description:'Help'},'write')).rejects.toThrow('CONNECTOR_OUTCOME_UNKNOWN');
    expect(fetch).toHaveBeenCalledTimes(1);expect(rows('business_connector_meters')[0].pending).toBe(1);
    await settleBusinessRun(c,rows('business_connector_runs')[0].id,{external_id:'verified-ticket',status:'completed'});
    expect(rows('business_connector_meters')[0]).toMatchObject({used:1,pending:0});expect(rows('billing_usage_events')).toHaveLength(1);
    await expect(settleBusinessRun(c,rows('business_connector_runs')[0].id,{})).rejects.toThrow('CONNECTOR_RUN_NOT_PENDING');
  });
  it('rejects missing entitlements and unapproved URLs before network access',async()=>{
    db.raw.exec('DELETE FROM billing_connector_entitlements');await expect(runBusinessOperation(c,source,'query',{},'one')).rejects.toThrow('CONNECTOR_ENTITLEMENT_REQUIRED');expect(fetch).not.toHaveBeenCalled();
    for(const url of ['http://business.example.com','https://127.0.0.1','https://business.example.com/path','https://user:pass@business.example.com','https://unapproved.example.com'])expect(()=>approvedOrigin(url,env.CONNECTOR_ALLOWED_ORIGINS)).toThrow();
  });
  it('rejects an expired subscription before reserving connector usage',async()=>{
    db.raw.exec('UPDATE subscriptions SET current_period_end=0');await expect(runBusinessOperation(c,source,'query',{},'one')).rejects.toThrow('CONNECTOR_ENTITLEMENT_REQUIRED');expect(fetch).not.toHaveBeenCalled();expect(rows('business_connector_runs')).toHaveLength(0);
  });
  it('enforces signed event freshness and never reflects credentials',async()=>{
    const raw=JSON.stringify({records:[record()]});const timestamp=String(Date.now()),event='one';
    const send=(signature:string,time=timestamp)=>businessConnectorRoutes.request('/v1/business-connectors/b/incoming',{method:'POST',headers:{'X-Connector-Timestamp':time,'X-Connector-Event':event,'X-Connector-Signature':signature},body:raw},env);
    expect((await send('bad')).status).toBe(401);const signature=await sign('a'.repeat(32),`${timestamp}.${event}.${raw}`);
    expect((await send(signature)).status).toBe(200);expect((await (await send(signature)).json() as any).duplicate).toBe(true);
    expect((await send(signature,String(Date.now()-600000))).status).toBe(401);const list=await(await req(base)).text();expect(list).not.toContain('private-token');expect(list).not.toContain('encrypted_result');
  });
  it('restricts configuration and action approval to owners/admins; isolates projects',async()=>{
    state.auth.role='developer';expect((await req(base+'/b/status',{status:'disabled'})).status).toBe(403);
    state.auth.role='owner';state.auth.tenantId='other';expect((await req(base)).status).toBe(403);
    state.auth.tenantId='t';expect((await req(base+'/b/bindings',{service_id:'foreign',enabled:true})).status).toBe(404);
  });
  it('requires explicit approval and rechecks revocation when processing an action',async()=>{
    const response=await req(base+'/b/actions',{service_id:'s',operation:'create_ticket',input:{title:'Help',description:'Details'},idempotency_key:'action-one'});
    expect(response.status).toBe(201);const action:any=await response.json();await processBusinessAction(env,action.id,'t');expect(fetch).not.toHaveBeenCalled();
    expect((await req(base+'/actions/'+action.id+'/approve',{confirm:true})).status).toBe(200);
    db.raw.exec("DELETE FROM business_connector_bindings");await processBusinessAction(env,action.id,'t');expect(fetch).not.toHaveBeenCalled();expect(rows('business_connector_actions')[0].status).toBe('failed');
  });
  it('executes an approved action once even if the queue delivers twice',async()=>{
    vi.mocked(fetch).mockImplementation(async()=>Response.json({external_id:'ticket-1',status:'completed'}));
    const action:any=await(await req(base+'/b/actions',{service_id:'s',operation:'create_ticket',input:{title:'Help',description:'Details'},idempotency_key:'action-one'})).json();
    await req(base+'/actions/'+action.id+'/approve',{confirm:true});await processBusinessAction(env,action.id,'t');await processBusinessAction(env,action.id,'t');
    expect(fetch).toHaveBeenCalledTimes(1);expect(rows('business_connector_actions')[0].status).toBe('completed');expect(rows('billing_usage_events')).toHaveLength(1);
  });
  it('syncs a bounded page on schedule and advances its cursor',async()=>{
    db.raw.prepare('UPDATE business_connectors SET config_json=?').run(JSON.stringify({...config(),sync_interval_minutes:5}));
    vi.mocked(fetch).mockImplementation(async()=>Response.json({records:[record()],next_cursor:'50'}));
    await scheduledBusinessSync(env);expect(rows('business_connector_records')).toHaveLength(1);expect(rows('business_connector_sync')[0].cursor).toBe('50');await scheduledBusinessSync(env);expect(fetch).toHaveBeenCalledTimes(1);
  });
});
describe('native HubSpot and verified identity',()=>{
  it('binds signed customer identity to tenant, project, service, conversation and connector',async()=>{
    const scope={tenant:'t',project:'p',service:'s',conversation:'c'};const token=await issueBusinessIdentity('secret',{...scope,subjects:{b:'123'}});
    expect(await verifyBusinessIdentity('secret',token,scope)).toEqual({b:'123'});
    for(const key of Object.keys(scope))await expect(verifyBusinessIdentity('secret',token,{...scope,[key]:'foreign'})).rejects.toThrow();
    await expect(verifyBusinessIdentity('wrong',token,scope)).rejects.toThrow();expect(await verifyBusinessIdentity('secret',undefined,scope)).toEqual({});
  });
  it('reads only configured HubSpot fields and never treats an arbitrary question as a contact ID',async()=>{
    const settings=configSchema.parse({provider:'hubspot',origin:'https://api.hubapi.com'});
    vi.mocked(fetch).mockImplementation(async()=>Response.json({id:'123',properties:{firstname:'Jane',lastname:'Doe',company:'Example',email:'secret@example.com',private_note:'never'},updatedAt:'2026-09-10T01:00:00Z',archived:false}));
    const result:any=await hubspotRequest(settings,'private-token','query',{subject:'123',query:'show another contact'});
    expect(result.records[0].subject).toBe('123');expect(JSON.stringify(result)).not.toContain('secret@example');expect(JSON.stringify(result)).not.toContain('never');
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/contacts/123?');await expect(hubspotRequest(settings,'private-token','query',{subject:'../all'})).rejects.toThrow();
  });
  it('creates a HubSpot ticket with configured pipeline values and safe result mapping',async()=>{
    const settings=configSchema.parse({provider:'hubspot',origin:'https://api.hubapi.com',ticket_pipeline:'4',ticket_stage:'8'});
    vi.mocked(fetch).mockImplementation(async()=>Response.json({id:'321',properties:{private:'never expose'}}));
    expect(await hubspotRequest(settings,'token','create_ticket',{title:'Help',description:'Problem'})).toEqual({external_id:'321',status:'completed'});
    const sent=JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));expect(sent.properties).toMatchObject({hs_pipeline:'4',hs_pipeline_stage:'8',subject:'Help'});
  });
  it('bounds response bodies before parsing external data',async()=>{await expect(readLimited(new Response('x'.repeat(101)),100)).rejects.toThrow('CONNECTOR_RESPONSE_TOO_LARGE');});
});
