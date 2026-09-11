export function page(portal) {
    const name = { platformadmin: "System administration", operations: "Operations", billing: "Billing" }[portal];
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} · dLogicAI</title><link rel="stylesheet" href="/styles.css"><script src="/app.js" defer></script></head>
<body data-portal="${portal}"><aside><a class="brand" href="/">dLogicAI<span>Staff workspace</span></a><p class="eyebrow">${name}</p><nav id="navigation" aria-label="Staff navigation"></nav><p class="access-note">Staff access only<br>Changes are recorded</p></aside>
<div class="workspace"><header><span>${name}</span><span id="identity">Verifying staff access…</span><a href="/cdn-cgi/access/logout">Sign out</a></header>
<main><div class="title-row"><div><p class="eyebrow">PLATFORM WORKSPACE</p><h1 id="title">Overview</h1><p id="description"></p></div><button id="refresh" type="button">Refresh</button></div>
<form id="filters"><label>Period<select id="days"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option><option value="0">All time</option></select></label><label>Tenant ID<input id="tenant" placeholder="All tenants"></label><label>Search<input id="search" placeholder="Name, subject or reference"></label><label class="case-filter" hidden>Status<select id="status"><option value="">All statuses</option><option value="submitted">Submitted</option><option value="in_progress">In progress</option><option value="waiting">Waiting</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label><label class="case-filter" hidden>Assigned team<select id="team"><option value="">All teams</option><option value="platformadmin">Platform admin</option><option value="operations">Operations</option><option value="billing">Billing</option></select></label><button type="submit" class="primary">Apply</button></form>
<p id="notice" role="status" aria-live="polite"></p><section id="metrics" aria-label="Summary"></section>
<section id="results" class="card"><div class="table-scroll"><table><caption id="caption"></caption><thead id="columns"></thead><tbody id="rows"></tbody></table></div><p id="empty" hidden>No records match these filters.</p></section>
<div id="pagination"><button id="previous" disabled>Previous</button><span id="page">Page 1</span><button id="next" disabled>Next</button></div>
<section id="configuration" hidden></section>
<p class="footnote">Times use your local timezone. Financial reports reflect stored platform records. They are not a live payment-provider reconciliation.</p>
</main></div>
<dialog id="case-dialog"><div class="title-row"><h2 id="case-title">Issue</h2><button id="close-case" type="button">Close</button></div><p id="case-meta"></p><p id="case-description" class="preserve"></p><a id="case-attachment" hidden>Download screenshot</a>
<form id="case-form"><div class="form-grid"><label>Assign to<select name="assigned_team"><option value="platformadmin">Platform admin</option><option value="operations">Operations</option><option value="billing">Billing</option></select></label><label>Status<select name="status"><option value="submitted">Submitted</option><option value="in_progress">In progress</option><option value="waiting">Waiting</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label></div><label>Internal update<textarea name="note" required maxlength="4000" rows="4" placeholder="What changed, what you checked, and the next step"></textarea></label><p class="help">Updates stay internal. Problem-report status is visible to the tenant.</p><button class="primary">Save update</button><button id="reload-case" type="button">Reload latest status</button></form><p id="case-notice" role="status"></p><h3>Recent updates</h3><div id="case-history"></div></dialog>
</body></html>`;
}
export const styles = `
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#16243a;background:#f3f6fa;font-synthesis:none}*{box-sizing:border-box}body{margin:0;display:grid;grid-template-columns:228px minmax(0,1fr);min-height:100vh}aside{background:#102139;color:#c5cfdd;padding:30px 20px;position:sticky;top:0;height:100vh;overflow-y:auto}.brand{color:white;text-decoration:none;font-size:26px;font-weight:800;letter-spacing:-1px}.brand span{display:block;font-size:12px;letter-spacing:.6px;font-weight:400;margin-top:5px;color:#95adc8}.eyebrow{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#62788f;margin:22px 0 12px}nav{display:grid;gap:5px}nav a{padding:10px 12px;border-radius:7px;font-size:14px;text-decoration:none;color:#c5cfdd}nav a:hover,nav a[aria-current=page]{background:#254260;color:white}.access-note{font-size:11px;line-height:1.8;margin-top:32px;color:#93a8be}.workspace{min-width:0}header{background:white;border-bottom:1px solid #dde4ec;padding:20px 32px;display:flex;gap:24px;align-items:center;font-size:13px}#identity{margin-left:auto;color:#65758a}header a{color:#315b88}main{padding:34px;max-width:1550px;margin:auto}.title-row{display:flex;justify-content:space-between;align-items:center;gap:16px}h1{font-size:30px;margin:0 0 10px;letter-spacing:-.8px}h2{font-size:22px}h3{font-size:16px}#description,.help,.footnote{color:#617389;font-size:13px;line-height:1.7;max-width:900px}.title-row .eyebrow{margin-top:0}button,input,select,textarea{font:inherit;font-size:13px;border-radius:7px;border:1px solid #cbd5e1;padding:10px 12px;background:white;color:#16243a}button{cursor:pointer;font-weight:600}button:hover{background:#edf3f9}button:disabled{opacity:.45;cursor:default}.primary{background:#215bca;color:white;border-color:#215bca}.primary:hover{background:#174baa}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #74a8ff;outline-offset:2px}#filters{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-top:25px;background:white;padding:18px;border:1px solid #dde4ec;border-radius:10px}label{display:grid;gap:7px;font-size:12px;font-weight:600}input{min-width:140px}textarea{width:100%;resize:vertical}#notice{min-height:22px;font-size:13px;color:#516882}.error{color:#b42318!important}#metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin:20px 0}.metric{background:white;border:1px solid #dde4ec;padding:20px;border-radius:10px}.metric p{margin:0;color:#617389;font-size:12px}.metric strong{display:block;font-size:30px;margin-top:8px;letter-spacing:-1px}.card{border:1px solid #dde4ec;border-radius:10px;background:white;overflow:hidden}.table-scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}caption{text-align:left;font-weight:700;padding:20px;font-size:15px}th{text-align:left;font-weight:600;color:#65758a;background:#f8fafc;font-size:11px;text-transform:uppercase;letter-spacing:.4px}th,td{padding:13px 16px;border-top:1px solid #e7ecf2;vertical-align:top}td{max-width:350px;overflow-wrap:anywhere}td button{color:#215bca;border:0;background:transparent;padding:0;text-align:left}#empty{padding:30px;text-align:center;color:#617389}#pagination{display:flex;gap:18px;align-items:center;justify-content:flex-end;margin:18px 0;font-size:12px}.badge{display:inline-block;border-radius:20px;background:#eef3fb;color:#355b86;padding:4px 8px;font-size:11px;white-space:nowrap}.badge.failed{background:#fff0ee;color:#a12418}.badge.completed,.badge.resolved,.badge.active{background:#eaf7ef;color:#1a7242}.footnote{font-size:11px;margin-top:28px}dialog{border:1px solid #dce4ef;border-radius:14px;padding:28px;width:min(760px,94vw);max-height:90vh;overflow:auto;box-shadow:0 20px 80px #10213944}dialog::backdrop{background:#10213977}.preserve{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.65}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:18px 0}#case-history article{border-top:1px solid #e1e7ef;padding:15px 0}#case-history small{color:#65758a}#configuration{display:grid;gap:20px}#configuration form{padding:24px}#configuration .form-grid{grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}[hidden]{display:none!important}@media(max-width:800px){body{display:block}aside{height:auto;position:static;padding:18px}aside .eyebrow,.access-note{display:none}nav{display:flex;overflow:auto;margin-top:16px}nav a{white-space:nowrap}.brand span{display:inline;margin-left:15px}header{padding:15px}main{padding:20px}#identity{max-width:160px;overflow-wrap:anywhere}.form-grid{grid-template-columns:1fr}#filters label{flex:1}#filters input,#filters select{width:100%}}
`;
export const script = String.raw `
(() => {
const $=id=>document.getElementById(id), portal=document.body.dataset.portal;
const esc=v=>String(v??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const labels={overview:"Overview",tenants:"Tenants & balances",usage:"Usage statistics",cases:"Issues & contact enquiries",payments:"Payment history",invoices:"Invoices",ledger:"Credit ledger","billing-events":"Billing events",audit:"Platform audit","tenant-audit":"Tenant audit",system:"System diagnostics",settings:"Configuration",staff:"Staff access"};
const descriptions={
 overview:"Activity across tenants. Usage totals count requests created in the selected period; token totals include completed requests only.",
 tenants:"Find a tenant and review its subscription status and current credit balance. Select a tenant to open its usage report.",
 usage:"Compare tenant usage by provider, model, billing mode and request outcome. Charges are stored in micro-units; credit balances are shown separately.",
 cases:"Review problem reports and contact enquiries, assign a team, and track progress with internal updates.",
 payments:"Recorded credit purchases and top-ups. Amounts are shown in minor units; the source records do not store a currency. Subscription invoices are listed separately.",
 invoices:"Stored invoices, their original currency, status and provider reference. Totals are in micro-units (1,000,000 per currency unit).",
 ledger:"Credit movements as recorded by the platform. Positive values add credits; negative values consume or reserve them.",
 "billing-events":"Stored payment-provider event status. Raw webhook payloads and error bodies are excluded. This view lists all retained events.",
 "tenant-audit":"Recorded tenant administration actions. Sensitive metadata is excluded.",
 audit:"Recorded staff changes with actor and request references. Case notes are available inside the issue history.",
 system:"Persisted AI requests, channel events and delivery outcomes. This is application diagnostic history, not a live Cloudflare runtime log stream.",
 settings:"Changes apply to new channel AI calls. Existing calls can finish. Configuration changes are version-checked and audited.",
 staff:"Explicit staff grants. Tenant membership does not confer staff access. Bootstrap and revoke grants through the documented operator procedure."
};
const views=["overview","tenants","usage","cases","payments","invoices","ledger","billing-events",...(portal!=="billing"?["audit","tenant-audit","system","settings"]:[]),...(portal==="platformadmin"?["staff"]:[])];
$("navigation").innerHTML=views.map(v=>'<a href="#'+v+'">'+labels[v]+'</a>').join("");
let current="overview",offset=0,generation=0,issue=null,caseGeneration=0;
async function api(path,options={}) {
 const response=await fetch(path,{credentials:"same-origin",...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok) throw new Error(data.error||"Unable to load data. Try again.");
 return data;
}
function params(){return new URLSearchParams({days:$("days").value,tenant:$("tenant").value.trim(),q:$("search").value.trim(),status:$("status").value,team:$("team").value,offset:String(offset)});}
function time(value){return value?new Date(Number(value)).toLocaleString():"—";}
function title(key){return key.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());}
function cell(key,value){
 if(key.endsWith("_at")||["period_start","period_end"].includes(key))return esc(time(value));
 if(key==="status")return '<span class="badge '+esc(value)+'">'+esc(String(value||"—").replace(/_/g," "))+'</span>';
 return esc(typeof value==="number"?value.toLocaleString():value);
}
function metric(label,value){return '<article class="metric"><p>'+esc(label)+'</p><strong>'+Number(value||0).toLocaleString()+'</strong></article>';}
async function load(){
 const run=++generation;current=views.includes(location.hash.slice(1))?location.hash.slice(1):"overview";
 $("title").textContent=labels[current];$("description").textContent=descriptions[current];
 document.querySelectorAll("nav a").forEach(a=>a.setAttribute("aria-current",a.hash==="#"+current?"page":"false"));
 const configuration=current==="settings";
 $("configuration").hidden=!configuration;$("results").hidden=configuration||current==="overview";$("pagination").hidden=configuration||current==="overview";
 $("filters").hidden=configuration||current==="staff"||current==="billing-events";
 document.querySelectorAll(".case-filter").forEach(e=>e.hidden=current!=="cases");
 $("search").closest("label").hidden=!["cases","tenants"].includes(current);$("days").closest("label").hidden=current==="tenants";$("tenant").closest("label").hidden=current==="audit";
 $("metrics").replaceChildren();$("rows").replaceChildren();$("columns").replaceChildren();$("configuration").replaceChildren();$("empty").hidden=true;$("next").disabled=true;$("previous").disabled=true;
 $("notice").className="";$("notice").textContent="Loading…";
 try {
  if(configuration){const data=await api("/api/settings");if(run!==generation)return;renderSettings(data);}
  else if(current==="overview"){
   const data=await api("/api/overview?"+params());if(run!==generation)return;
   const u=data.usage||{},open=(data.cases||[]).filter(c=>!["resolved","closed"].includes(c.status)).reduce((n,c)=>n+Number(c.count),0);
   $("metrics").innerHTML=metric("Requests",u.requests)+metric("Completed",u.completed)+metric("Failed",u.failed)+metric("Pending",u.pending)+metric("Tokens",u.tokens)+metric("Open issues in period",open);
  } else {
   const data=await api("/api/records/"+current+"?"+params());if(run!==generation)return;
   const records=data.records||[],keys=Object.keys(records[0]||{});
   $("caption").textContent=labels[current];
   $("columns").innerHTML="<tr>"+keys.map(k=>'<th scope="col">'+esc(title(k))+'</th>').join("")+"</tr>";
   $("rows").innerHTML=records.map((r,index)=>"<tr>"+keys.map(k=>"<td>"+(current==="cases"&&k==="subject"?'<button data-case="'+index+'">'+esc(r[k])+'</button>':current==="tenants"&&k==="name"?'<button data-tenant="'+esc(r.id)+'">'+esc(r[k])+'</button>':cell(k,r[k]))+"</td>").join("")+"</tr>").join("");
   $("rows").querySelectorAll("[data-case]").forEach(b=>b.onclick=()=>openCase(records[Number(b.dataset.case)].source,records[Number(b.dataset.case)].id));
   $("rows").querySelectorAll("[data-tenant]").forEach(b=>b.onclick=()=>{$("tenant").value=b.dataset.tenant;location.hash="usage";});
   $("empty").hidden=records.length>0;$("next").disabled=!data.has_more;$("previous").disabled=offset===0;$("page").textContent="Page "+(offset/50+1);
  }
  $("notice").textContent="Updated "+new Date().toLocaleTimeString();
 }catch(error){if(run===generation){$("notice").className="error";$("notice").textContent=error.message;}}
}
async function openCase(source,id,preserve=false){
 const run=++caseGeneration, draft=preserve?$("case-form").elements.note.value:"";
 $("case-notice").textContent="Loading issue…";
 if(!$("case-dialog").open)$("case-dialog").showModal();
 $("case-form").hidden=true;
 try{
  const data=await api("/api/cases/"+encodeURIComponent(source)+"/"+encodeURIComponent(id));if(run!==caseGeneration)return;
  issue=data.record;$("case-attachment").hidden=!issue.attachment_name;$("case-attachment").href="/api/cases/problem/"+encodeURIComponent(issue.id)+"/screenshot";$("case-title").textContent=issue.subject;$("case-meta").textContent=[source,issue.tenant_name,issue.email,issue.mobile,issue.id].filter(Boolean).join(" · ");$("case-description").textContent=issue.description;
  const form=$("case-form");form.elements.assigned_team.value=issue.assigned_team;form.elements.status.value=issue.status;form.elements.note.value=draft;form.hidden=false;
  $("case-history").innerHTML=data.updates.map(u=>'<article><small>'+esc(time(u.created_at))+' · '+esc(u.actor)+' · '+esc(u.assigned_team)+' · '+esc(u.status)+'</small><p class="preserve">'+esc(u.note)+'</p></article>').join("")||"<p>No staff updates yet.</p>";
  $("case-notice").textContent="";
 }catch(error){$("case-notice").textContent=error.message;}
}
$("case-form").onsubmit=async event=>{
 event.preventDefault();if(!issue)return;
 const form=event.currentTarget,buttons=[...form.querySelectorAll("button,select,textarea")],saveGeneration=caseGeneration;buttons.forEach(b=>b.disabled=true);
 try{await api("/api/cases/"+issue.source+"/"+encodeURIComponent(issue.id),{method:"POST",body:JSON.stringify({version:issue.version,assigned_team:form.elements.assigned_team.value,status:form.elements.status.value,note:form.elements.note.value})});if($("case-dialog").open && saveGeneration===caseGeneration) await openCase(issue.source,issue.id);load();}
 catch(error){$("case-notice").textContent=error.message;}
 finally{buttons.forEach(b=>b.disabled=false);}
};
$("close-case").onclick=()=>{caseGeneration++;$("case-dialog").close();};$("reload-case").onclick=()=>issue&&openCase(issue.source,issue.id,true);
function renderSettings(data){
 const bounds={max_input_characters:[100,4000],max_output_tokens:[64,8192],max_outputs:[1,50],max_output_characters:[100,20000]};
 const keys=[...(portal==="platformadmin"?["platform"]:[]),"channel.web","channel.telegram","channel.whatsapp"];
 const descriptions={enabled:"Enable channel replies",max_input_characters:"Maximum input characters",max_output_tokens:"Maximum generated tokens",max_outputs:"Maximum reply items",max_output_characters:"Maximum reply characters",ai_enabled:"Enable AI across channels",support_email:"Platform support email"};
 $("configuration").innerHTML=keys.map(key=>{
  const saved=data.settings.find(s=>s.key===key),value=saved?.value||(key==="platform"?{ai_enabled:true,support_email:""}:data.defaults);
  return '<form class="card" data-key="'+key+'" data-version="'+(saved?.version||0)+'"><h2>'+esc(key==="platform"?"Platform settings":key.replace("channel.","")+" guardrails")+'</h2><p class="help">Reply items are paragraphs or list entries. Provider usage is billed for all generated tokens, including text removed by reply limits.</p><div class="form-grid">'+Object.entries(value).map(([field,v])=>'<label>'+esc(descriptions[field]||field)+'<input name="'+field+'" type="'+(typeof v==="boolean"?"checkbox":typeof v==="number"?"number":"email")+'" '+(typeof v==="boolean"?(v?"checked":""):'value="'+esc(v)+'"')+(typeof v==="number"?' required min="'+bounds[field][0]+'" max="'+bounds[field][1]+'" step="1"':"")+'></label>').join("")+'</div><button class="primary">Save configuration</button><p class="setting-status" role="status"></p></form>';
 }).join("");
 $("configuration").querySelectorAll("form").forEach(form=>form.onsubmit=async event=>{
  event.preventDefault();const value={};form.querySelectorAll("input").forEach(input=>value[input.name]=input.type==="checkbox"?input.checked:input.type==="number"?Number(input.value):input.value.trim());
  const button=form.querySelector("button"),notice=form.querySelector(".setting-status");button.disabled=true;notice.textContent="Saving…";
  try{const data=await api("/api/settings/"+form.dataset.key,{method:"POST",body:JSON.stringify({version:Number(form.dataset.version),value})});form.dataset.version=String(data.version);notice.textContent="Saved. New channel AI calls use these limits.";}
  catch(error){notice.textContent=error.message;}finally{button.disabled=false;}
 });
}
$("filters").onsubmit=e=>{e.preventDefault();offset=0;load();};$("refresh").onclick=load;
$("previous").onclick=()=>{offset=Math.max(0,offset-50);load();};$("next").onclick=()=>{offset+=50;load();};
window.addEventListener("hashchange",()=>{offset=0;load();});
api("/api/me").then(data=>{$("identity").textContent=data.staff.email+" · "+data.staff.role;load();}).catch(error=>{$("identity").textContent="Access unavailable";$("notice").className="error";$("notice").textContent=error.message;});
})();
`;
