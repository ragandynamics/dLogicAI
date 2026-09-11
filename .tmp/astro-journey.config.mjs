import { defineConfig } from "../node_modules/.pnpm/astro@7.2.10_@emnapi+core@1_4417fa17b16374390bb53ca3d9825e49/node_modules/astro/dist/config/entrypoint.js";
import tailwindcss from "../node_modules/.pnpm/@tailwindcss+vite@4.3.3_vit_f56423df7085e97a0a21fde7bf2f4493/node_modules/@tailwindcss/vite/dist/index.mjs";
let status = "testing";
const conversation={id:"sample",project_id:"project",project_name:"Demo project",title:"Delivery enquiry",model:"Demo model",updated_at:Date.now(),sentiment:"negative",urgency_score:75};
export default defineConfig({
  root:"C:/CloudFlare/dlogicai/apps/web",
  output:"static",
  server:{host:"127.0.0.1",port:4339},
  vite:{plugins:[tailwindcss(),{name:"local-journey-fixtures",configureServer(server){
    server.middlewares.use((req,res,next)=>{
      if(!req.url.startsWith("/api/")) return next();
      const url=new URL(req.url,"http://localhost"); const path=url.pathname;
      let data={}; let code=200;
      const range={since:Date.now()-Number(url.searchParams.get("days")||30)*86400000,until:Date.now()};
      if(path==="/api/v1/me") data={user:{name:"Demo Owner",email:"demo@example.test"},tenant:{id:"tenant",name:"Journey preview"},role:"owner",memberships:[{tenant_id:"tenant",name:"Journey preview"}]};
      else if(path==="/api/v1/projects") data={projects:[{id:"project",name:"Demo project"}]};
      else if(path==="/api/v1/operations/usage") data={...range,records:url.searchParams.get("days")==="7"?[]:[{project_name:"Demo project",provider:"gemini",model:"Demo model",billing_mode:"managed",status:"completed",requests:12,input_tokens:1200,output_tokens:450},{project_name:"Demo project",provider:"gemini",model:"Demo model",billing_mode:"managed",status:"failed",requests:1,input_tokens:0,output_tokens:0},{project_name:"Demo project",provider:"gemini",model:"Demo model",billing_mode:"managed",status:"reserved",requests:2,input_tokens:0,output_tokens:0}]};
      else if(path==="/api/v1/operations/analytics") data={...range,summary:{conversations:15,analyzed:12,negative:1,urgent:1,escalation:0},records:[conversation]};
      else if(path==="/api/v1/operations/audit") data={...range,records:url.searchParams.get("action")?[]:[{id:"audit",created_at:Date.now(),actor:"Demo Owner",action:"channel.activated",resource_type:"channel_installation",resource_id:"channel",request_id:"request_demo"}],has_more:false};
      else if(path==="/api/v1/operations/channels") data={records:[{id:"widget",project_id:"project",chat_service_id:"service",channel:"web",name:"Website support",status:"draft",project_name:"Demo project",service_name:"Support"},{id:"channel",project_id:"project",chat_service_id:"service",channel:"telegram",name:"Demo bot",status,project_name:"Demo project",service_name:"Support"}]};
      else if(path==="/api/v1/conversations") data={conversations:[conversation]};
      else if(path==="/api/v1/conversations/sample") data={conversation,intelligence:{sentiment:"negative",emotion:"frustration"},messages:[{role:"user",content:"Where is my order?",created_at:Date.now()}]};
      else if(path.endsWith("/messages")) {code=503;data={error:{message:"Fixture failure"}};}
      else if(path.endsWith("/chat-services")) data={chat_services:[{id:"service",name:"Support"}]};
      else if(path.endsWith("/web-widget")) data={widgets:[{id:"widget",name:"Website support",status:"draft",config:{origin:"https://example.test",title:"Support",welcome:"How can we help?",color:"#2563eb",position:"right"}}]};
      else if(path.endsWith("/activate")) {status="active";data={status};}
      else if(path.endsWith("/deactivate")) {status="inactive";data={status};}
      else if(path.endsWith("/channel-installations")) data={installations:[{id:"channel",channel:"telegram",external_account_id:"Demo bot",status,created_at:Date.now()}]};
      else {code=404;data={error:{message:"No fixture for this endpoint"}};}
      res.statusCode=code;res.setHeader("Content-Type","application/json");res.end(JSON.stringify(data));
    });
  }}]}
});
