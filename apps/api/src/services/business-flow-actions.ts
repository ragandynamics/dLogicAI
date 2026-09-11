import { z } from 'zod';
import type { AppContext } from '../types';
import { id,now } from '../utils/common';
import { encryptText,sha256 } from '../utils/crypto';
import { actionSchemas,configSchema } from './business-protocol';
import { auditMutation } from './audit';

const mappingSchema=z.object({type:z.literal('business_connector'),connector_id:z.string().min(1),operation:z.enum(['create_lead','create_ticket','request_booking']),input_slots:z.record(z.string(),z.string().min(1).max(120))}).strict();
// A completed dialog may propose a write, never execute one. The encrypted proposal is
// reviewed using the same owner/admin queue as manually prepared actions.
export async function proposeFlowActions(c:AppContext,project:string,service:string,conversation:string,flow:string,outcome:string,slots:Record<string,string>) {
  const auth=c.get('auth');if(!auth)return;
  const row=await c.env.DB.prepare('SELECT actions_json FROM dialog_outcomes WHERE tenant_id=? AND flow_version_id=? AND outcome_key=?').bind(auth.tenantId,flow,outcome).first<{actions_json:string}>();
  const entries=z.array(z.unknown()).max(50).parse(JSON.parse(row?.actions_json||'[]'));
  for(const [index,entry] of entries.entries()) {
    const mapping=mappingSchema.safeParse(entry);if(!mapping.success)continue;
    const m=mapping.data;
    const source=await c.env.DB.prepare(`SELECT s.config_json FROM business_connectors s JOIN business_connector_bindings b ON b.connector_id=s.id
      WHERE s.id=? AND s.tenant_id=? AND s.project_id=? AND s.status='active' AND b.service_id=? AND b.tenant_id=s.tenant_id AND b.project_id=s.project_id`)
      .bind(m.connector_id,auth.tenantId,project,service).first<{config_json:string}>();
    if(!source||!configSchema.parse(JSON.parse(source.config_json)).actions.includes(m.operation))continue;
    const input=actionSchemas[m.operation].safeParse(Object.fromEntries(Object.entries(m.input_slots).map(([field,slot])=>[field,slots[slot]])));
    if(!input.success)continue;
    const action=id('action'),key=`flow:${conversation}:${flow}:${outcome}:${index}`;
    await auditMutation(c,auth,'connector.action_proposed','business_action',action,c.env.DB.prepare(`INSERT OR IGNORE INTO business_connector_actions
      (id,tenant_id,project_id,connector_id,service_id,conversation_id,operation,encrypted_input,request_hash,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(action,auth.tenantId,project,m.connector_id,service,conversation,m.operation,await encryptText(JSON.stringify(input.data),c.env.MASTER_KEY),await sha256(JSON.stringify(input.data)),key,now(),now()));
  }
}
