import { z } from 'zod';

export const actionSchemas = {
  create_lead: z.object({ name: z.string().trim().min(1).max(100), email: z.string().email().max(254), requirements: z.string().trim().min(1).max(2000) }).strict(),
  create_ticket: z.object({ title: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(4000) }).strict(),
  request_booking: z.object({ service: z.string().trim().min(1).max(200), preferred_time: z.string().trim().min(1).max(100), notes: z.string().max(1000).default('') }).strict(),
};
export const configSchema = z.object({
  provider: z.enum(['business_api','hubspot']).default('business_api'),
  origin: z.string().url(),
  public_live: z.boolean().default(false),
  actions: z.array(z.enum(['create_lead','create_ticket','request_booking'])).max(3).default([]),
  max_age_seconds: z.number().int().min(60).max(86400).default(3600),
  contact_properties: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,99}$/)).min(1).max(10).default(['firstname','lastname','company']),
  ticket_pipeline: z.string().regex(/^\d+$/).optional(),
  ticket_stage: z.string().regex(/^\d+$/).optional(),
  lead_notes_property: z.string().regex(/^[a-z][a-z0-9_]{0,99}$/).optional(),
  sync_interval_minutes: z.number().int().min(0).max(1440).refine(v=>v===0||v>=5).default(0),
  max_records: z.number().int().min(50).max(10000).default(5000),
}).strict();
export type BusinessConfig = z.infer<typeof configSchema>;
export const recordSchema = z.object({
  id: z.string().trim().min(1).max(200),
  visibility: z.enum(['public','customer']),
  subject: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().max(200), content: z.string().max(8000),
  source_url: z.string().url().max(1000).refine(v => {const u=new URL(v);return u.protocol === 'https:'&&!u.username&&!u.password;}).optional(),
  version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  updated_at: z.number().int().nonnegative(), expires_at: z.number().int().nonnegative(),
  deleted: z.boolean().default(false),
}).strict().refine(r => r.visibility === 'public' ? !r.subject : !!r.subject, 'Customer records require a subject; public records must omit it.');
export const recordsSchema = z.object({ records: z.array(recordSchema).max(50), next_cursor:z.string().max(200).optional() }).strict();
export type BusinessRecord = z.infer<typeof recordSchema>;

// Only operator-approved, exact HTTPS origins can receive credentials. Paths and redirects
// are deliberately not configurable; platform operators must verify the host they approve.
export function approvedOrigin(value: string, allowlist: string | undefined): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port ||
      !url.hostname.includes('.') || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':') ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname) ||
      !(allowlist || '').split(',').map(s => s.trim()).includes(url.origin)) throw new Error('CONNECTOR_ORIGIN_NOT_APPROVED');
  return url.origin;
}
export async function readLimited(response: Response, limit = 512000): Promise<string> {
  if (Number(response.headers.get('content-length') || 0) > limit) throw new Error('CONNECTOR_RESPONSE_TOO_LARGE');
  const reader = response.body?.getReader(); if (!reader) return '';
  let size = 0; const chunks: Uint8Array[] = [];
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length;
    if (size > limit) throw new Error('CONNECTOR_RESPONSE_TOO_LARGE'); chunks.push(value); }
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}
export async function sign(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)))).map(v => v.toString(16).padStart(2,'0')).join('');
}
export async function verifySignature(secret: string, text: string, signature: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, Uint8Array.from(signature.match(/../g)!, v => parseInt(v,16)), new TextEncoder().encode(text));
}

export async function businessRequest(origin: string, token: string, operation: 'health'|'query'|'sync'|keyof typeof actionSchemas,
  input: unknown, idempotencyKey: string): Promise<unknown> {
  // Every action request is exactly one attempt. An ambiguous write is never blindly retried.
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${origin}/dlogic/v1/${operation}`, {
      method:'POST', redirect:'error', signal:controller.signal,
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}`, 'Idempotency-Key':idempotencyKey },
      body:JSON.stringify(input),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('CONNECTOR_UPSTREAM_FAILED'); }
    const data = JSON.parse(await readLimited(response));
    if (operation === 'health') return z.object({ ok:z.literal(true), protocol:z.literal('dlogic-business-v1') }).parse(data);
    if (operation === 'query' || operation === 'sync') return recordsSchema.parse(data);
    return z.object({ external_id:z.string().min(1).max(200), status:z.enum(['accepted','completed']), message:z.string().max(1000).optional() }).strict().parse(data);
  } finally { clearTimeout(timeout); }
}
