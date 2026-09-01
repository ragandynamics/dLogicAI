import { z } from "zod";

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array {
  if (!hex || hex.length % 2 !== 0) {
    throw new Error("Invalid hexadecimal value.");
  }

  const out = new Uint8Array(hex.length / 2);

  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);

    if (Number.isNaN(byte)) {
      throw new Error("Invalid hexadecimal value.");
    }

    out[i] = byte;
  }

  return out;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const iterations = 100000;

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    key,
    256
  );

  return `pbkdf2$${iterations}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  try {
    const parts = stored.split("$");

    if (parts.length !== 4) {
      return false;
    }

    const [algorithm, iterationsString, saltHex, hashHex] = parts;

    if (algorithm !== "pbkdf2") {
      return false;
    }

    const iterations = Number(iterationsString);

    if (!Number.isInteger(iterations) || iterations <= 0) {
      return false;
    }

    const salt = hexToBytes(saltHex);

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt as BufferSource,
        iterations,
        hash: "SHA-256",
      },
      key,
      256
    );

    const actual = new Uint8Array(bits);
    const expected = hexToBytes(hashHex);

    if (actual.length !== expected.length) {
      return false;
    }

    let diff = 0;

    for (let i = 0; i < actual.length; i++) {
      diff |= actual[i] ^ expected[i];
    }

    return diff === 0;
  } catch {
    return false;
  }
}

export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters.")
  .max(200)
  .regex(/[a-z]/, "Password must include a lowercase letter.")
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/[0-9]/, "Password must include a number.")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character.");

export async function sha256(value: string): Promise<string> {
  return bytesToHex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
    )
  );
}

export function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function createToken(): Promise<{ value: string; hash: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const value = base64Url(raw);
  return { value, hash: await sha256(value) };
}

export function base32(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

export function base32Bytes(value: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let buffer = 0;
  const output: number[] = [];

  for (const character of value.toUpperCase().replaceAll("=", "")) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid TOTP secret.");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
}

export async function totpCode(
  secret: string,
  timestamp = Date.now()
): Promise<string> {
  const counter = Math.floor(timestamp / 30000);
  const data = new ArrayBuffer(8);
  const view = new DataView(data);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey(
    "raw",
    base32Bytes(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  const offset = digest[digest.length - 1] & 15;
  const number =
    ((digest[offset] & 127) << 24) |
    ((digest[offset + 1] & 255) << 16) |
    ((digest[offset + 2] & 255) << 8) |
    (digest[offset + 3] & 255);
  return String(number % 1000000).padStart(6, "0");
}

export async function verifyTotp(
  secret: string,
  code: string
): Promise<boolean> {
  for (const offset of [-30000, 0, 30000]) {
    if (code === (await totpCode(secret, Date.now() + offset))) return true;
  }
  return false;
}

export async function encryptText(
  plaintext: string,
  masterHex: string
): Promise<string> {
  const keyBytes = hexToBytes(masterHex);

  if (keyBytes.length !== 32) {
    throw new Error("MASTER_KEY must be exactly 32 bytes hex.");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    new TextEncoder().encode(plaintext)
  );

  return `${bytesToHex(iv)}.${bytesToHex(new Uint8Array(ciphertext))}`;
}

export async function decryptText(
  payload: string,
  masterHex: string
): Promise<string> {
  const parts = payload.split(".");

  if (parts.length !== 2) {
    throw new Error("Invalid encrypted credential payload.");
  }

  const [ivHex, dataHex] = parts;

  const keyBytes = hexToBytes(masterHex);

  if (keyBytes.length !== 32) {
    throw new Error("MASTER_KEY must be exactly 32 bytes hex.");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: hexToBytes(ivHex) as BufferSource,
    },
    key,
    hexToBytes(dataHex) as BufferSource
  );

  return new TextDecoder().decode(plaintext);
}
