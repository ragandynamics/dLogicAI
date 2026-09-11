import { vi,it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
vi.mock('../apps/api/src/utils/auth',()=>({requireDashboard:async(c:any)=>{const auth={tenantId:'sample',userId:'sample-owner',role:'owner'};c.set('auth',auth);return auth;}}));
import { formRoutes } from '../apps/api/src/routes/forms';
class Statement{values:any[]=[];constructor(readonly db:DatabaseSync,readonly sql:string){}bind(...v:any[]){this.values=v;return this;}async first(){return this.db.prepare(this.sql).get(...this.values)||null;}async all(){return {results:this.db.prepare(this.sql).all(...this.values)};}execute(){return {meta:{changes:Number(this.db.prepare(this.sql).run(...this.values).changes)}};}async run(){return this.execute();}}
class Db{raw=new DatabaseSync(':memory:');prepare(sql:string){return new Statement(this.raw,sql);}async batch(statements:Statement[]){this.raw.exec('BEGIN');try{const rows=statements.map(s=>s.execute());this.raw.exec('COMMIT');return rows;}catch(e){this.raw.exec('ROLLBACK');throw e;}}}
it('serves an isolated sample owner workspace on loopback for browser review',async()=>{
 const root='C:/CloudFlare/dlogicai/',db=new Db();for(const file of ['0001_initial.sql','0002_usage_ledger.sql','002_billing_and_ai_credits.sql','002_configurable_billing.sql','0006_chat_services.sql','027_webchat_telegram_onboarding.sql','032_staff_portals.sql','033_business_connectors.sql','034_interactive_forms.sql'])db.raw.exec(readFileSync(root+'apps/api/migrations/'+file,'utf8'));
 db.raw.exec(`INSERT INTO tenants(id,name,slug,created_at,updated_at) VALUES('sample','LOCAL SAMPLE DATA','sample',0,0);INSERT INTO projects(id,tenant_id,name,created_at,updated_at) VALUES('sample-project','sample','LOCAL SAMPLE DATA',0,0);INSERT INTO chat_services(id,tenant_id,project_id,name,created_at,updated_at) VALUES('sample-service','sample','sample-project','Sample Support',0,0);UPDATE platform_settings SET value_json='{"enabled":true,"stop":"immediate","reason":"Local fixture only"}' WHERE key='feature.forms';`);
 const env={DB:db,MASTER_KEY:'01'.repeat(32),CORS_ORIGINS:'http://127.0.0.1:4345'};
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url!,'http://127.0.0.1:4345');let response:Response;
  if(url.pathname==='/api/v1/projects')response=Response.json({projects:[{id:'sample-project',name:'LOCAL SAMPLE DATA'}]});
  else if(url.pathname.endsWith('/chat-services'))response=Response.json({chat_services:[{id:'sample-service',name:'Sample Support'}]});
  else if(url.pathname.endsWith('/business-connectors'))response=Response.json({connectors:[],bindings:[]});
  else if(url.pathname.startsWith('/api/')){let body='';for await(const chunk of req)body+=chunk;response=await formRoutes.request('http://127.0.0.1:4345'+url.pathname.slice(4)+url.search,{method:req.method,headers: new Headers(Object.entries(req.headers).filter(([,v])=>typeof v==='string') as [string,string][]),...(['GET','HEAD'].includes(req.method!)?{}:{body})},env as any);}
  else if(['/form-builder.js','/form-runtime.js'].includes(url.pathname))response=new Response(readFileSync(root+'apps/web/public'+url.pathname),{headers:{'Content-Type':'text/javascript'}});
  else if(url.pathname.startsWith('/forms/')){const formId=url.pathname.split('/')[2];let html=readFileSync(root+'apps/web/src/pages/forms/[formId].astro','utf8').replace(/^---[\s\S]*?---\s*/,'').replace('data-form-id={Astro.params.formId}','data-form-id="'+formId.replace(/[^a-zA-Z0-9_-]/g,'')+'"').replace('style is:global','style');html=html.replace('<body>','<body><p style="text-align:center">LOCAL SAMPLE DATA — isolated preview</p>');response=new Response(html,{headers:{'Content-Type':'text/html','Referrer-Policy':'no-referrer'}});}
  else if(url.pathname==='/dashboard/forms'){let html=readFileSync(root+'apps/web/src/pages/dashboard/forms.astro','utf8').replace(/^---[\s\S]*?---\s*/,'').replace(/<AppLayout[^>]*>/,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Forms sample preview</title></head><body style="font-family:system-ui;max-width:1000px;margin:30px auto;padding:20px;background:#f3f6fa"><h2>LOCAL SAMPLE DATA — isolated owner workspace</h2>').replace('</AppLayout>','</body></html>').replaceAll(' is:inline','').replaceAll(' is:global','');response=new Response(html,{headers:{'Content-Type':'text/html'}});}
  else response=new Response('Local form preview only',{status:404});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Local preview error');}});
 await new Promise<void>(resolve=>server.listen(4345,'127.0.0.1',resolve));console.log('FORM PREVIEW READY http://127.0.0.1:4345/dashboard/forms');await new Promise(()=>{});
});
