import type { Env,AppContext } from '../types';
import { id,now } from '../utils/common';
import { configSchema } from './business-protocol';
import { runBusinessOperation,ingestRecords,type BusinessInstallation } from './business-connectors';

// One bounded page per source per tick; no unbounded recursive pagination in a Worker.
export async function scheduledBusinessSync(env:Env) {
  const sources=await env.DB.prepare(`SELECT s.* FROM business_connectors s LEFT JOIN business_connector_sync x ON x.connector_id=s.id
    WHERE s.status='active' AND json_extract(s.config_json,'$.sync_interval_minutes')>=5
    AND (x.connector_id IS NULL OR x.next_at<=?) AND (x.locked_until IS NULL OR x.locked_until<?)
    ORDER BY COALESCE(x.next_at,0),s.id LIMIT 3`).bind(now(),now()).all<BusinessInstallation>();
  for(const source of sources.results) {
    const c={env,get:(key:string)=>key==='auth'?{tenantId:source.tenant_id,userId:'connector-sync',role:'system'}:undefined} as unknown as AppContext;
    await env.DB.prepare('INSERT OR IGNORE INTO business_connector_sync(connector_id,cycle) VALUES(?,?)').bind(source.id,id('cycle')).run();
    const claim=await env.DB.prepare('UPDATE business_connector_sync SET locked_until=? WHERE connector_id=? AND locked_until<? AND next_at<=?').bind(now()+120000,source.id,now(),now()).run();
    if(!claim.meta.changes)continue;
    const state=await env.DB.prepare('SELECT * FROM business_connector_sync WHERE connector_id=?').bind(source.id).first<any>();
    try {
      const result:any=await runBusinessOperation(c,source,'sync',{cursor:state.cursor},`sync:${state.cycle}:${state.cursor}`);
      await ingestRecords(c,source,`sync:${state.cycle}:${state.cursor}`,result);
      const config=configSchema.parse(JSON.parse(source.config_json));
      if(result.next_cursor===state.cursor)throw new Error('CONNECTOR_CURSOR_LOOP');
      await env.DB.prepare('UPDATE business_connector_sync SET cursor=?,cycle=?,next_at=?,locked_until=0,failures=0 WHERE connector_id=?')
        .bind(result.next_cursor||'',result.next_cursor?state.cycle:id('cycle'),now()+(result.next_cursor?60000:config.sync_interval_minutes*60000),source.id).run();
    } catch {
      // A fresh cycle permits a later read retry without replaying a failed reservation forever.
      await env.DB.prepare('UPDATE business_connector_sync SET cycle=?,next_at=?,locked_until=0,failures=failures+1 WHERE connector_id=?')
        .bind(id('cycle'),now()+Math.min(3600000,60000*2**Math.min(6,state.failures||0)),source.id).run();
    }
  }
  // Keep idempotency metadata; discard replay payloads after seven days. Expired records
  // remain version tombstones so delayed events cannot resurrect older customer information.
  await env.DB.prepare('UPDATE business_connector_runs SET encrypted_result=NULL WHERE completed_at<? AND encrypted_result IS NOT NULL').bind(now()-7*86400000).run();
  await env.DB.prepare("UPDATE business_connector_records SET content='',title='',source_url=NULL,deleted=2 WHERE expires_at<? AND deleted=0").bind(now()-86400000).run();
}
