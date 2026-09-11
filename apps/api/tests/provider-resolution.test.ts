import { describe, expect, it } from "vitest";
import { encryptText } from "../src/utils/crypto";
import { resolveProvider } from "../src/services/providers";

const masterKey = "01".repeat(32);

function context(options: {
  mode: "managed" | "tenant";
  provider?: "auto" | "google" | "openai";
  tenantCredential?: { provider: string; encrypted_credentials: string } | null;
  projectCredential?: { provider: string; encrypted_credentials: string } | null;
  geminiKey?: string;
  serviceKey?: string;
}) {
  const queries: string[] = [];
  const env = {
    MASTER_KEY: masterKey,
    GEMINI_API_KEY: options.geminiKey,
    DB: {
      prepare(sql: string) {
        queries.push(sql);
        return {
          bind() {
            return {
              async first() {
                if (sql.includes("FROM chat_services")) {
                  return {
                    provider_mode: options.mode,
                    ai_provider: options.provider || "auto",
                    provider_credential_id: null,
                    encrypted_llm_key: options.serviceKey || null,
                  };
                }
                if (sql.includes("FROM tenant_llm_credentials")) {
                  return options.tenantCredential ?? null;
                }
                if (sql.includes("FROM provider_credentials")) {
                  return options.projectCredential ?? null;
                }
                return null;
              },
            };
          },
        };
      },
    },
  };
  return {
    queries,
    c: {
      env,
      get(name: string) {
        return name === "auth"
          ? { tenantId: "tenant", userId: "user", role: "owner" }
          : undefined;
      },
    } as never,
  };
}

describe("provider resolution", () => {
  it("uses an encrypted service Gemini key before the managed platform key", async () => {
    const encrypted = await encryptText("service-gemini-key", masterKey);
    const { c } = context({
      mode: "managed",
      provider: "google",
      geminiKey: "managed-gemini-key",
      serviceKey: encrypted,
    });
    await expect(resolveProvider(c, "project", undefined, "service")).resolves.toEqual({
      mode: "byok",
      provider: "google",
      apiKey: "service-gemini-key",
    });
  });

  it("uses the active tenant-wide Gemini key selected by a Chat Service", async () => {
    const encrypted = await encryptText("configured-gemini-key", masterKey);
    const { c } = context({
      mode: "tenant",
      provider: "google",
      tenantCredential: { provider: "google", encrypted_credentials: encrypted },
    });
    await expect(resolveProvider(c, "project", undefined, "service")).resolves.toEqual({
      mode: "byok",
      provider: "google",
      apiKey: "configured-gemini-key",
    });
  });

  it("falls back to a legacy project Gemini key for tenant provisioning", async () => {
    const encrypted = await encryptText("legacy-gemini-key", masterKey);
    const { c } = context({
      mode: "tenant",
      provider: "google",
      tenantCredential: null,
      projectCredential: { provider: "google", encrypted_credentials: encrypted },
    });
    await expect(resolveProvider(c, "project", undefined, "service")).resolves.toEqual({
      mode: "byok",
      provider: "google",
      apiKey: "legacy-gemini-key",
    });
  });

  it("does not silently use tenant credentials for managed provisioning", async () => {
    const encrypted = await encryptText("tenant-key", masterKey);
    const { c, queries } = context({
      mode: "managed",
      provider: "google",
      tenantCredential: { provider: "google", encrypted_credentials: encrypted },
      geminiKey: "managed-gemini-key",
    });
    await expect(resolveProvider(c, "project", undefined, "service")).resolves.toEqual({
      mode: "managed",
      provider: "google",
      apiKey: "managed-gemini-key",
    });
    expect(queries.some((sql) => sql.includes("tenant_llm_credentials"))).toBe(false);
  });

  it("reports a missing matching tenant credential without falling back to managed AI", async () => {
    const { c } = context({ mode: "tenant", provider: "google" });
    await expect(resolveProvider(c, "project", undefined, "service")).resolves.toEqual({
      mode: "byok",
      provider: "google",
      apiKey: undefined,
    });
  });
});
