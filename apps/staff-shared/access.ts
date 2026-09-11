// Origin verification is required even when Cloudflare Access protects the hostname.
// Only configured issuer keys are fetched; JWT-supplied URLs are never trusted.
type AccessEnv = { ACCESS_ISSUER?: string; ACCESS_AUD?: string };
type Key = JsonWebKey & { kid?: string; alg?: string; use?: string };
const cache = new Map<string, { until: number; keys: Key[] }>();
function bytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid token");
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}
export async function verifyAccess(token: string | undefined, env: AccessEnv): Promise<string | null> {
  try {
    if (!token || token.length > 16384 || !env.ACCESS_AUD || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER || "")) return null;
    const issuer = env.ACCESS_ISSUER!;
    const parts = token.split("."); if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(bytes(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(bytes(parts[1])));
    const timestamp = Math.floor(Date.now() / 1000);
    if (header.alg !== "RS256" || typeof header.kid !== "string" || payload.iss !== issuer ||
        !Array.isArray(payload.aud) || !payload.aud.includes(env.ACCESS_AUD) ||
        !Number.isFinite(payload.exp) || payload.exp <= timestamp ||
        (payload.nbf !== undefined && (!Number.isFinite(payload.nbf) || payload.nbf > timestamp)) ||
        typeof payload.email !== "string" || payload.email.length > 254 || !payload.email.includes("@")) return null;
    let cached = cache.get(issuer);
    if (!cached || cached.until <= Date.now()) {
      const response = await fetch(issuer + "/cdn-cgi/access/certs", { signal: AbortSignal.timeout(5000), redirect: "error" });
      if (!response.ok) return null;
      const data = await response.json() as { keys: Key[] };
      if (!Array.isArray(data.keys) || data.keys.length > 20) return null;
      cached = { until: Date.now() + 300000, keys: data.keys }; cache.set(issuer, cached);
    }
    const key = cached.keys.find(k => k.kid === header.kid && k.kty === "RSA" && (!k.alg || k.alg === "RS256") && (!k.use || k.use === "sig"));
    if (!key) return null;
    const imported = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", imported, bytes(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
    return valid ? payload.email.toLowerCase() : null;
  } catch { return null; }
}
