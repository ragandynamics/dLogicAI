const fs=require("node:fs");const path=require("node:path");const http=require("node:http");const {pathToFileURL}=require("node:url");
const root=path.resolve(__dirname,"..");const ts=require(path.join(root,"apps/api/node_modules/typescript"));
const src=fs.readFileSync(path.join(root,"apps/staff-shared/ui.ts"),"utf8");
const output=path.join(__dirname,"staff-ui.mjs");fs.writeFileSync(output,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
(async()=>{
const ui=await import(pathToFileURL(output)); const stamp=Date.now();
const issues=[{source:"problem",id:"sample-issue",tenant_id:"tenant-demo",tenant_name:"Acme Support",subject:"Payment receipt missing",description:"The customer paid for a credit pack but cannot find their receipt.",email:null,mobile:null,status:"submitted",assigned_team:"operations",version:0,created_at:stamp},{source:"contact",id:"sample-contact",tenant_name:"Northwind",subject:"Product enquiry",description:"Please explain the available service options.",email:"hello@example.test",mobile:"",status:"submitted",assigned_team:"operations",version:0,created_at:stamp}];const updates=[];
const defaults={enabled:true,max_input_characters:4000,max_output_tokens:512,max_outputs:10,max_output_characters:4000};
const settings=[{key:"platform",value:{ai_enabled:true,support_email:"support@example.test"},version:0},...["web","telegram","whatsapp"].map(k=>({key:"channel."+k,value:{...defaults},version:0}))];
for(const [portal,port]of [["platformadmin",4391],["operations",4392],["billing",4393]]){
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,"http://localhost"),route=url.pathname;
  if(route==="/"){res.setHeader("Content-Type","text/html; charset=utf-8");res.end(ui.page(portal).replace("<main>","<main><p class=\"help\">LOCAL PREVIEW · SAMPLE DATA · No live platform actions</p>"));return;}
  if(route==="/app.js"){res.setHeader("Content-Type","text/javascript");res.end(ui.script);return;}
  if(route==="/styles.css"){res.setHeader("Content-Type","text/css");res.end(ui.styles);return;}
  let data={};let code=200;
  if(route==="/api/me")data={staff:{email:portal+"@example.test",role:portal},portal};
  else if(route==="/api/overview")data={usage:{requests:1580,completed:1525,failed:18,pending:37,tokens:812400},cases:[{status:"submitted",count:2}]};
  else if(route.startsWith("/api/records/")){
   const view=route.split("/").pop();let records=[];
   if(view==="cases")records=issues.filter(i=>(!url.searchParams.get("team")||i.assigned_team===url.searchParams.get("team"))&&(!url.searchParams.get("status")||i.status===url.searchParams.get("status"))).map(({description,email,mobile,version,...r})=>r);
   if(view==="tenants")records=[{id:"tenant-demo",name:"Acme Support",status:"active",subscription_status:"active",credit_balance:42500}];
   if(view==="usage")records=[{tenant_id:"tenant-demo",tenant:"Acme Support",provider:"google",model:"Managed",billing_mode:"managed",status:"completed",requests:1525,input_tokens:510000,output_tokens:302400,charge_micros:765000}];
   if(view==="payments")records=[{id:"payment-demo",tenant:"Acme Support",purchase_type:"manual",credits:10000,amount_minor_units:1000,payment_provider:"stripe",payment_reference:"sample-reference",status:"completed",created_at:stamp}];
   if(view==="invoices")records=[{id:"invoice-demo",tenant:"Acme Support",currency:"usd",total_micros:10000000,status:"paid",period_start:stamp-2592000000,period_end:stamp,created_at:stamp}];
   if(view==="ledger")records=[{id:"ledger-demo",tenant:"Acme Support",amount:10000,entry_type:"purchase",source:"manual_purchase",created_at:stamp}];
   if(view==="system")records=[{kind:"delivery",id:"delivery-demo",tenant_id:"tenant-demo",status:"failed",code:"PROVIDER_ERROR",created_at:stamp}];
   if(view==="audit")records=[{actor:"operations@example.test",action:"case.updated",resource:"problem:sample-issue",created_at:stamp}];
   data={records,has_more:false};
  }else if(route==="/api/settings")data={settings:settings.filter(s=>portal==="platformadmin"||s.key!=="platform"),defaults};
  else if(route.startsWith("/api/settings/")){
   let body="";for await(const chunk of req)body+=chunk;const parsed=JSON.parse(body),s=settings.find(s=>s.key===route.split("/").pop());
   if(!s||s.version!==parsed.version){code=409;data={error:"Settings changed. Reload before saving."};}else{s.value=parsed.value;s.version++;data={saved:true,version:s.version};}
  }else if(route.startsWith("/api/cases/")){
   const parts=route.split("/"),item=issues.find(i=>i.source===parts[3]&&i.id===parts[4]);
   if(!item){code=404;data={error:"Issue not found."};}
   else if(req.method==="POST"){let body="";for await(const chunk of req)body+=chunk;const change=JSON.parse(body);
    if(change.version!==item.version){code=409;data={error:"This issue changed. Reload before saving."};}
    else{Object.assign(item,{assigned_team:change.assigned_team,status:change.status,version:item.version+1});updates.unshift({...change,actor:portal+"@example.test",created_at:Date.now(),source:item.source,id:item.id});data={saved:true,version:item.version};}
   }else data={record:item,updates:updates.filter(u=>u.id===item.id)};
  }else{code=404;data={error:"No fixture for this endpoint."};}
  res.statusCode=code;res.setHeader("Content-Type","application/json");res.end(JSON.stringify(data));
 }catch{res.statusCode=500;res.end(JSON.stringify({error:"Preview fixture error"}));}});
 server.listen(port,"127.0.0.1",()=>console.log(portal+": http://127.0.0.1:"+port));
}
})();
