import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const index=arg.indexOf("=");return [arg.slice(0,index),arg.slice(index+1)];}));
if(!["uat","production"].includes(args.environment) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(args.database_id||"") || !/^[a-zA-Z0-9_-]{1,63}$/.test(args.database_name||"") || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(args.issuer||"")) throw new Error("Supply environment=uat|production database_id=<uuid> database_name=<name> issuer=https://<team>.cloudflareaccess.com and a separate audience for each portal.");
if(args.bucket && !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(args.bucket)) throw new Error("Invalid attachment bucket name.");
if(new Set([args["system-admin_audience"],args.operations_audience,args.billing_audience]).size!==3) throw new Error("Use a distinct Access audience for each portal.");
const output=path.join(root,".tmp","staff-release",args.environment);
await fs.mkdir(output,{recursive:true});
for(const name of ["system-admin","operations","billing"]){
 const audience=args[name+"_audience"];
 if(!/^[a-zA-Z0-9_-]{1,256}$/.test(audience||""))throw new Error("Missing or invalid "+name+"_audience.");
 const config={
  name:"dlogicai-"+name+(args.environment==="uat"?"-uat":""),main:path.join(root,"apps",name,"src","index.ts"),compatibility_date:"2026-08-18",compatibility_flags:["nodejs_compat"],
  observability:{enabled:true},vars:{ACCESS_ISSUER:args.issuer,ACCESS_AUD:audience},
  d1_databases:[{binding:"DB",database_name:args.database_name,database_id:args.database_id,migrations_dir:path.join(root,"apps","api","migrations")}],
  ...(args.bucket?{r2_buckets:[{binding:"DATA_BUCKET",bucket_name:args.bucket}]}:{})
 };
 const target=path.join(output,name+".json");await fs.writeFile(target,JSON.stringify(config,null,2)+"\n");console.log(target);
}
console.log("Configuration files prepared only. No resources created, migrations applied or Workers deployed.");
