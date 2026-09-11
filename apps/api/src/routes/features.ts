import { Hono } from 'hono';
import type { Env,HonoVariables } from '../types';
import { requireDashboard } from '../utils/auth';
import { featureCatalog,featureAllowed,featurePolicy } from '../services/platform-features';
const router=new Hono<{Bindings:Env;Variables:HonoVariables}>();
router.get('/v1/features',async c=>{
 const auth=await requireDashboard(c);if(!auth)return c.json({error:{message:'Sign in to view available features.'}},401);
 c.header('Cache-Control','no-store');
 const features=await Promise.all(featureCatalog.map(async f=>{
  const policy=await featurePolicy(c.env.DB,f.key);
  return {...f,available:await featureAllowed(c.env.DB,f.key,auth.tenantId),reason:!f.implemented?'Not implemented':!policy.value.enabled?'Temporarily unavailable':'Subject to your tenant access and service configuration'};
 }));
 return c.json({features});
});
export const featureRoutes=router;
