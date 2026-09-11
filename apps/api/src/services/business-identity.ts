import { z } from 'zod';
import { sign, verifySignature } from './business-protocol';
const claimsSchema=z.object({tenant:z.string(),project:z.string(),service:z.string(),conversation:z.string(),subjects:z.record(z.string(),z.string().min(1).max(200)),exp:z.number().int()}).strict();
export async function issueBusinessIdentity(secret:string, claims:Omit<z.infer<typeof claimsSchema>,'exp'>) {
  const payload=encodeURIComponent(JSON.stringify({...claims,exp:Date.now()+300000}));
  return `${payload}.${await sign(secret,'business-identity:'+payload)}`;
}
export async function verifyBusinessIdentity(secret:string,token:string|undefined,scope:{tenant:string;project:string;service:string;conversation:string}) {
  if(!token) return {} as Record<string,string>;
  if(token.length>8000) throw new Error('INVALID_CUSTOMER_IDENTITY');
  const split=token.lastIndexOf('.'), payload=token.slice(0,split),signature=token.slice(split+1);
  if(!await verifySignature(secret,'business-identity:'+payload,signature)) throw new Error('INVALID_CUSTOMER_IDENTITY');
  const claims=claimsSchema.parse(JSON.parse(decodeURIComponent(payload)));
  if(claims.exp<Date.now() || claims.exp>Date.now()+300000 || Object.entries(scope).some(([k,v])=>claims[k as keyof typeof scope]!==v)) throw new Error('INVALID_CUSTOMER_IDENTITY');
  return claims.subjects;
}
