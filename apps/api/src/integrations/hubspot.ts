import { z } from 'zod';
import { readLimited, type BusinessConfig, type BusinessRecord } from '../services/business-protocol';

// Native adapter: fixed provider origin, explicit properties, no customer-supplied search filters.
export async function hubspotRequest(config:BusinessConfig, token:string, operation:string, input:any):Promise<unknown> {
  const base='https://api.hubapi.com/crm/objects/2026-09/';
  const properties=config.contact_properties.join(',');
  let path='contacts?limit=1&properties='+encodeURIComponent(properties), method='GET', body:unknown;
  if(operation==='query') {
    if(!/^\d+$/.test(input.subject||'')) throw new Error('VERIFIED_HUBSPOT_CONTACT_REQUIRED');
    path=`contacts/${encodeURIComponent(input.subject)}?properties=${encodeURIComponent(properties)}`;
  } else if(operation==='sync') {
    const cursor=z.string().regex(/^\d*$/).max(100).parse(input.cursor||'');
    path=`contacts?limit=50&properties=${encodeURIComponent(properties)}${cursor?'&after='+cursor:''}`;
  } else if(operation==='create_lead') {
    if(!config.lead_notes_property)throw new Error('HUBSPOT_LEAD_PROPERTY_REQUIRED');
    path='contacts'; method='POST'; body={properties:{firstname:input.name,email:input.email,[config.lead_notes_property]:input.requirements}};
  } else if(operation==='create_ticket') {
    if(!config.ticket_stage || !config.ticket_pipeline) throw new Error('HUBSPOT_TICKET_PIPELINE_REQUIRED');
    path='tickets'; method='POST'; body={properties:{subject:input.title,content:input.description,hs_pipeline:config.ticket_pipeline,hs_pipeline_stage:config.ticket_stage}};
  } else if(operation!=='health') throw new Error('HUBSPOT_OPERATION_UNSUPPORTED');
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),8000);
  try {
    const response=await fetch(base+path,{method,redirect:'error',signal:controller.signal,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok) {await response.body?.cancel();throw new Error('HUBSPOT_UNAVAILABLE');}
    const raw=JSON.parse(await readLimited(response));
    if(operation==='health') { z.object({results:z.array(z.unknown())}).parse(raw);return {ok:true,protocol:'hubspot'}; }
    if(method==='POST') return { external_id:z.string().min(1).max(200).parse(raw.id),status:'completed' };
    const rows=operation==='query'?[raw]:z.array(z.unknown()).max(50).parse(raw.results);
    const records:BusinessRecord[]=rows.map(value=>{
      const row=z.object({id:z.string().regex(/^\d+$/),properties:z.record(z.string(),z.unknown()),updatedAt:z.string(),archived:z.boolean().optional()}).parse(value);
      const updated=Date.parse(row.updatedAt); if(!Number.isFinite(updated)) throw new Error('HUBSPOT_INVALID_RECORD');
      const fields=Object.fromEntries(config.contact_properties.map(key=>[key,String(row.properties[key]??'').slice(0,600)]));
      // Freshness is when HubSpot was read; source version is the CRM modification timestamp.
      return {id:row.id,subject:row.id,visibility:'customer',title:'Customer profile',content:JSON.stringify(fields),version:updated,updated_at:Date.now(),expires_at:Date.now()+config.max_age_seconds*1000,deleted:!!row.archived};
    });
    const next=raw.paging?.next?.after;
    return {records,...(next!==undefined?{next_cursor:z.coerce.string().regex(/^\d+$/).max(100).parse(next)}:{})};
  } finally {clearTimeout(timeout);}
}
