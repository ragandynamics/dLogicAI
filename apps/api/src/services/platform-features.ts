import { z } from 'zod';

export const featureCatalog = [
  { key: 'chat.qa', name: 'Q&A Chatbot', implemented: true },
  { key: 'chat.guided', name: 'Guided Chatbot', implemented: true },
  { key: 'channel.web', name: 'Web Chat', implemented: true },
  { key: 'channel.telegram', name: 'Telegram', implemented: true },
  { key: 'channel.whatsapp', name: 'WhatsApp', implemented: true },
  { key: 'connector.actions', name: 'Business connector actions', implemented: true },
  { key: 'forms', name: 'Interactive Forms', implemented: true },
  { key: 'template.contact', name: 'Contact form starter', implemented: true, parent: 'forms' },
  { key: 'template.support', name: 'Support form starter', implemented: true, parent: 'forms' },
  { key: 'questionnaires', name: 'Interactive Questionnaires', implemented: false },
  { key: 'surveys', name: 'Interactive Surveys', implemented: false },
  { key: 'scoring', name: 'Questionnaire scoring', implemented: false, parent: 'questionnaires' },
  { key: 'calculations', name: 'Calculators and estimates', implemented: false, parent: 'forms' },
  { key: 'submission.uploads', name: 'Submission attachments', implemented: false, parent: 'forms' },
  ...['assessment','product_finder','quiz'].map(key => ({ key: 'template.' + key, name: key.replaceAll('_',' '), implemented: false, parent: 'questionnaires' })),
  ...['onboarding','service_request','booking','inspection'].map(key => ({ key: 'template.' + key, name: key.replaceAll('_',' '), implemented: false, parent: 'forms' })),
  { key: 'template.satisfaction', name: 'Satisfaction survey', implemented: false, parent: 'surveys' },
] as const;
export const featureSchema = z.object({ enabled: z.boolean(), stop: z.enum(['immediate','finish_existing']), reason: z.string().trim().max(300), disabled_at: z.number().int().min(0).optional() }).strict();
export type FeaturePolicy = z.infer<typeof featureSchema>;
export async function featurePolicy(db: D1Database, key: string) {
  const definition = featureCatalog.find(f => f.key === key);
  if (!definition) throw new Error('Unknown platform feature');
  const saved = await db.prepare('SELECT value_json,version,updated_by,updated_at FROM platform_settings WHERE key=?').bind('feature.'+key).first<{value_json:string;version:number;updated_by:string;updated_at:number}>();
  const value = saved ? featureSchema.parse(JSON.parse(saved.value_json)) : { enabled: definition.implemented && key !== 'forms', stop: 'immediate' as const, reason: '' };
  return { ...definition, value, version: saved?.version || 0, updated_by: saved?.updated_by || null, updated_at: saved?.updated_at || null };
}
export async function featureAllowed(db: D1Database, key: string, tenant?: string, startedAt?: number): Promise<boolean> {
  const policy = await featurePolicy(db,key);
  if (!policy.implemented) return false;
  if ('parent' in policy && !await featureAllowed(db,policy.parent,tenant,startedAt)) return false;
  if (!policy.value.enabled && !(policy.value.stop === 'finish_existing' && startedAt !== undefined && startedAt < (policy.value.disabled_at || 0))) return false;
  if (tenant) {
    const grant = await db.prepare('SELECT value_json FROM platform_settings WHERE key=?').bind('feature-tenant.'+tenant+'.'+key).first<{value_json:string}>();
    if (grant && JSON.parse(grant.value_json).enabled !== true) return false;
  }
  return true;
}
