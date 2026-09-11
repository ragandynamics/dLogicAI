import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const ts = require('typescript');
const base = new URL('./', import.meta.url);
const raw=readFileSync(new URL('deployed-worker.raw',base));
const type=readFileSync(new URL('content-type.txt',base),'utf8');
const form=await new Response(raw,{headers:{'Content-Type':type}}).formData();
if ([...form.keys()].join(',') !== 'index.js') throw new Error('Unexpected deployed modules');
const original=String(form.get('index.js'));
let patched=original;
function replaceOnce(from,to) {
 if(patched.split(from).length!==2) throw new Error('Patch context mismatch');
 patched=patched.replace(from,to);
}
let helper=ts.transpileModule(readFileSync('apps/api/src/stripe-period.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
helper=helper.replace('export function subscriptionPeriod','function readStripeSubscriptionPeriod');
replaceOnce('async function stripeSubscriptionPeriod(env, subscriptionId) {',helper+'\nasync function stripeSubscriptionPeriod(env, subscriptionId) {');
replaceOnce(`  return {
    start: Number(subscription.current_period_start || 0) * 1e3 || null,
    end: Number(subscription.current_period_end || 0) * 1e3 || null,
    trialEnd: Number(subscription.trial_end || 0) * 1e3 || null
  };`,'  return readStripeSubscriptionPeriod(subscription);');
replaceOnce('const trialEnd = Number(s.trial_end || 0) * 1e3 || null;','const period = readStripeSubscriptionPeriod(s);\n        const trialEnd = period.trialEnd;');
replaceOnce('current_period_start=MAX(current_period_start, ?), current_period_end=?,','current_period_start=MAX(current_period_start, COALESCE(?, current_period_start)), current_period_end=COALESCE(?, current_period_end),');
replaceOnce('Number(s.current_period_start || 0) * 1e3, Number(s.current_period_end || 0) * 1e3,','period.start, period.end,');
const old='gemini-2.5-flash-lite', next='gemini-3.5-flash-lite';
if(patched.split(old).length!==4) throw new Error('Unexpected model references');
patched=patched.replaceAll(old,next);
replaceOnce('  let model = parsed.data.model;',`  let model = parsed.data.model;\n  if (model === "${old}") model = "${next}";`);
replaceOnce('async function callGemini(env, apiKey, model, input, responseLanguage, stream = false, maxOutputTokens) {',`async function callGemini(env, apiKey, model, input, responseLanguage, stream = false, maxOutputTokens) {\n  if (model === "${old}") model = "${next}";`);
writeFileSync(new URL('original.mjs',base),original);
writeFileSync(new URL('release.mjs',base),patched);
writeFileSync(new URL('release-test.mjs',base),patched+'\nexport { registerBillingRoutes, callGemini };\n');
writeFileSync(new URL('release-manifest.json',base),JSON.stringify({worker:'dlogicai-api-uat',originalSha256:createHash('sha256').update(original).digest('hex'),releaseSha256:createHash('sha256').update(patched).digest('hex'),changes:['Stripe subscription item periods','Gemini managed model replacement and legacy alias'],migrations:[]},null,2));
console.log('Prepared isolated release and test copy');



