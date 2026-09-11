import { defineConfig } from "../node_modules/.pnpm/astro@7.2.10_@emnapi+core@1_4417fa17b16374390bb53ca3d9825e49/node_modules/astro/dist/config/entrypoint.js";
import tailwindcss from "../node_modules/.pnpm/@tailwindcss+vite@4.3.3_vit_f56423df7085e97a0a21fde7bf2f4493/node_modules/@tailwindcss/vite/dist/index.mjs";
const config={provider:'hubspot',origin:'https://api.hubapi.com',contact_properties:['firstname','lastname','company'],max_age_seconds:3600,sync_interval_minutes:0,actions:['create_ticket'],ticket_pipeline:'0',ticket_stage:'1'};
let connectors=[{id:'hubspot',name:'Sample HubSpot CRM',status:'configured',config,tested_at:null}],bindings=[],actions=[],runs=[];
export default defineConfig({root:'C:/CloudFlare/dlogicai/apps/web',output:'static',server:{host:'127.0.0.1',port:4341},vite:{plugins:[tailwindcss(),{name:'connector-fixtures',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 if(!req.url.startsWith('/api/'))return next();
 let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};const path=new URL(req.url,'http://localhost').pathname;let data={},status=200;
 if(path==='/api/v1/me')data={user:{name:'Sample Owner',email:'sample@example.test'},tenant:{id:'t',name:'LOCAL SAMPLE DATA'},role:'owner',memberships:[]};
 else if(path==='/api/v1/projects')data={projects:[{id:'p',name:'LOCAL SAMPLE DATA',environment:'development'}]};
 else if(path.endsWith('/chat-services'))data={chat_services:[{id:'s',name:'Support'}]};
 else if(path.endsWith('/business-connectors')&&req.method==='GET')data={connectors,bindings,actions,runs,usage:{completed:runs.length,charge_micros:0},can_manage:true};
 else if(path.endsWith('/business-connectors')){const c={id:'new'+connectors.length,name:body.name,config:body.config,status:'configured'};connectors.push(c);data={id:c.id};}
 else if(path.endsWith('/test')){connectors.find(c=>path.includes('/'+c.id+'/')).tested_at=Date.now();data={ok:true};}
 else if(path.endsWith('/status')){connectors.find(c=>path.includes('/'+c.id+'/')).status=body.status;data={ok:true};}
 else if(path.endsWith('/bindings')){bindings=[{connector_id:connectors.find(c=>path.includes('/'+c.id+'/')).id,service_id:body.service_id,live:Number(body.live)}];data={ok:true};}
 else if(path.endsWith('/sync')){runs.push({id:'r',operation:'sync',status:'completed',attempts:1,created_at:Date.now()});data={received:2};}
 else if(path.endsWith('/actions')&&req.method==='POST'){const a={id:'action'+actions.length,...body,status:'pending',created_at:Date.now()};actions.push(a);data=a;}
 else if(path.endsWith('/approve')){actions.find(a=>path.includes('/'+a.id+'/')).status='approved';data={ok:true};}
 else if(path.includes('/actions/'))data=actions.find(a=>path.endsWith('/'+a.id));
 else if(path.endsWith('/configuration')){const c=connectors.find(c=>path.includes('/'+c.id+'/'));c.name=body.name;c.config=body.config;c.status='configured';c.tested_at=null;data={ok:true};}
 else {status=404;data={error:{message:'No local fixture'}};}
 res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));
});}}]}});
