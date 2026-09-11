import assert from 'node:assert/strict';
import {callGemini} from './release-test.mjs';
let requested;
const oldFetch=globalThis.fetch;
globalThis.fetch=async (url)=>{requested=String(url);return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'fixture response'}]}}],usageMetadata:{promptTokenCount:1,candidatesTokenCount:1}}),{status:200});};
try {
 const result=await callGemini({},'fixture','gemini-2.5-flash-lite','hello','auto',false,10);
 assert.match(requested,/gemini-3\.5-flash-lite/);
 assert.equal(result.text,'fixture response');
 console.log('Isolated provider compatibility test passed');
} finally {globalThis.fetch=oldFetch;}
