import { beforeEach,afterEach,it,expect,vi } from "vitest";
import { verifyAccess } from "../../staff-shared/access";
let pair:CryptoKeyPair, jwk:JsonWebKey, issuer:string;
const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString("base64url");
beforeEach(async()=>{
 issuer="https://team-"+crypto.randomUUID()+".cloudflareaccess.com";
 pair=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
 jwk=await crypto.subtle.exportKey("jwk",pair.publicKey);
 vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({keys:[{...jwk,kid:"test",alg:"RS256"}]}),{headers:{"Content-Type":"application/json"}})));
});
afterEach(()=>vi.unstubAllGlobals());
async function token(overrides:Record<string,unknown>={},header:Record<string,unknown>={}){
 const body=encode({alg:"RS256",kid:"test",...header})+"."+encode({iss:issuer,aud:["application"],exp:Math.floor(Date.now()/1000)+300,email:"Admin@Example.test",...overrides});
 const signature=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",pair.privateKey,new TextEncoder().encode(body));
 return body+"."+Buffer.from(signature).toString("base64url");
}
it("verifies the signature, configured issuer and application audience",async()=>{
 expect(await verifyAccess(await token(),{ACCESS_ISSUER:issuer,ACCESS_AUD:"application"})).toBe("admin@example.test");
 expect(fetch).toHaveBeenCalledWith(issuer+"/cdn-cgi/access/certs",expect.anything());
});
it("rejects expired, premature and wrong-audience tokens",async()=>{
 for(const claims of [{exp:0},{nbf:Date.now()},{aud:["other"]},{iss:"https://evil.test"},{email:null}]) expect(await verifyAccess(await token(claims),{ACCESS_ISSUER:issuer,ACCESS_AUD:"application"})).toBeNull();
});
it("rejects forged signatures and algorithm substitution",async()=>{
 const signed=await token();const parts=signed.split(".");parts[1]=encode({iss:issuer,aud:["application"],exp:Date.now(),email:"attacker@example.test"});
 expect(await verifyAccess(parts.join("."),{ACCESS_ISSUER:issuer,ACCESS_AUD:"application"})).toBeNull();
 expect(await verifyAccess(await token({}, {alg:"none"}),{ACCESS_ISSUER:issuer,ACCESS_AUD:"application"})).toBeNull();
});
it("fails closed with missing configuration, invalid issuer or unavailable keys",async()=>{
 expect(await verifyAccess(await token(),{})).toBeNull();
 expect(await verifyAccess(await token(),{ACCESS_ISSUER:"http://localhost",ACCESS_AUD:"application"})).toBeNull();
 vi.mocked(fetch).mockResolvedValue(new Response("",{status:503}));
 expect(await verifyAccess(await token(),{ACCESS_ISSUER:issuer,ACCESS_AUD:"application"})).toBeNull();
});
