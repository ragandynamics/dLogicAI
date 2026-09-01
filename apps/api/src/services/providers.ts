import type { AppContext, AuthContext, Env, ProviderResult } from "../types";
import { decryptText } from "../utils/crypto";

export const MANAGED_MAX_OUTPUT_TOKENS = 1024;

export async function detectLanguage(text: string): Promise<string> {
  if (/[\u0B80-\u0BFF]/.test(text)) {
    return "ta";
  }

  if (/[\u0900-\u097F]/.test(text)) {
    return "hi";
  }

  if (/[\u4E00-\u9FFF]/.test(text)) {
    return "zh";
  }

  if (/[\u3040-\u30FF]/.test(text)) {
    return "ja";
  }

  if (/[\uAC00-\uD7AF]/.test(text)) {
    return "ko";
  }

  if (/[\u0600-\u06FF]/.test(text)) {
    return "ar";
  }

  if (/[\u0400-\u04FF]/.test(text)) {
    return "ru";
  }

  if (/\b(el|la|los|las|que|cómo|como|por|para|una|un)\b/i.test(text)) {
    return "es";
  }

  if (/\b(le|les|des|une|comment|pour|avec)\b/i.test(text)) {
    return "fr";
  }

  return "en";
}

export function parseOpenAIStreamEvent(
  eventData: string
): { inputTokens?: number; outputTokens?: number } {
  try {
    const parsed = JSON.parse(eventData);
    const usage = parsed.usage || parsed.response?.usage || {};
    const inputTokens = usage.input_tokens ?? usage.prompt_tokens;
    const outputTokens = usage.output_tokens ?? usage.completion_tokens;
    return {
      inputTokens: Number.isInteger(Number(inputTokens))
        ? Number(inputTokens)
        : undefined,
      outputTokens: Number.isInteger(Number(outputTokens))
        ? Number(outputTokens)
        : undefined,
    };
  } catch {
    return {};
  }
}

export function parseGeminiStreamEvent(
  eventData: string
): { inputTokens?: number; outputTokens?: number } {
  try {
    const parsed = JSON.parse(eventData);
    const metadata = parsed.usageMetadata || {};
    const inputTokens = metadata.promptTokenCount;
    const outputTokens = metadata.candidatesTokenCount;
    return {
      inputTokens: Number.isInteger(Number(inputTokens))
        ? Number(inputTokens)
        : undefined,
      outputTokens: Number.isInteger(Number(outputTokens))
        ? Number(outputTokens)
        : undefined,
    };
  } catch {
    return {};
  }
}

export function accumulateTokensFromStream(
  provider: string,
  sseLines: string[]
): { inputTokens: number; outputTokens: number } {
  let finalInputTokens = 0;
  let finalOutputTokens = 0;

  for (const line of sseLines) {
    if (!line.startsWith("data: ")) continue;

    const eventData = line.slice(6).trim();
    if (!eventData || eventData === "[DONE]") continue;

    const parsed =
      provider === "openai"
        ? parseOpenAIStreamEvent(eventData)
        : parseGeminiStreamEvent(eventData);

    if (Number.isInteger(parsed.inputTokens) && Number.isInteger(parsed.outputTokens)) {
      finalInputTokens = Number(parsed.inputTokens);
      finalOutputTokens = Number(parsed.outputTokens);
    }
  }

  return { inputTokens: finalInputTokens, outputTokens: finalOutputTokens };
}

export function modelPricing(
  provider: string,
  model: string
): { input: number; output: number } {
  if (provider === "openai") {
    if (model.includes("gpt-5-mini")) {
      return {
        input: 0.25,
        output: 2.0,
      };
    }

    return {
      input: 1.0,
      output: 4.0,
    };
  }

  if (provider === "google") {
    if (model.includes("flash-lite")) {
      return {
        input: 0.1,
        output: 0.4,
      };
    }

    return {
      input: 0.3,
      output: 2.5,
    };
  }

  return {
    input: 0,
    output: 0,
  };
}

export function costMicros(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = modelPricing(provider, model);

  return Math.round(
    ((inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000) *
      1_000_000
  );
}

export function estimatedInputTokens(input: unknown): number {
  const content = typeof input === "string" ? input : JSON.stringify(input);
  return new TextEncoder().encode(content || "").length + 512;
}

export function managedCustomerChargeMicros(
  plan: { managed_ai_markup_bps?: number } | null,
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const markupBps = Number(plan?.managed_ai_markup_bps ?? 3500);
  return Math.ceil(
    (costMicros(provider, model, inputTokens, outputTokens) *
      (10_000 + markupBps)) /
      10_000
  );
}

export function estimatedCreditChargeMicros(
  plan: { byok_request_fee_micros?: number; managed_ai_markup_bps?: number } | null,
  billingMode: string,
  provider: string,
  model: string,
  input: unknown
): number {
  if (billingMode === "byok") {
    return Math.max(Number(plan?.byok_request_fee_micros || 0), 1);
  }
  return Math.max(
    managedCustomerChargeMicros(
      plan,
      provider,
      model,
      estimatedInputTokens(input),
      MANAGED_MAX_OUTPUT_TOKENS
    ),
    1
  );
}

export async function callOpenAI(
  env: Env,
  apiKey: string,
  model: string,
  input: unknown,
  responseLanguage?: string,
  stream = false,
  maxOutputTokens?: number
): Promise<ProviderResult> {
  const system =
    responseLanguage && responseLanguage !== "auto"
      ? `Respond in ${responseLanguage}. Preserve code, URLs, product names and identifiers unless translation is requested.`
      : "Respond in the user's language unless the user explicitly requests another language.";

  const payload: any = {
    model,
    input: [
      {
        role: "system",
        content: system,
      },
      ...(Array.isArray(input)
        ? input
        : [
            {
              role: "user",
              content: String(input),
            },
          ]),
    ],
    stream,
    ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${body}`);
  }

  if (stream) {
    return {
      provider: "openai",
      model,
      text: "",
      inputTokens: 0,
      outputTokens: 0,
      providerCostMicros: 0,
      stream: response.body!,
    };
  }

  const data: any = await response.json();
  const text =
    data.output_text ||
    (data.output || [])
      .flatMap((item: any) => item.content || [])
      .map((item: any) => item.text || "")
      .join("");

  const usage = data.usage || {};
  const inputTokens = Number(usage.input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);

  return {
    provider: "openai",
    model,
    text,
    inputTokens,
    outputTokens,
    providerCostMicros: costMicros("openai", model, inputTokens, outputTokens),
  };
}

export async function callGemini(
  env: Env,
  apiKey: string,
  model: string,
  input: unknown,
  responseLanguage?: string,
  stream = false,
  maxOutputTokens?: number
): Promise<ProviderResult> {
  const system =
    responseLanguage && responseLanguage !== "auto"
      ? `Respond in ${responseLanguage}. Preserve code, URLs, product names and identifiers unless translation is requested.`
      : "Respond in the user's language unless the user explicitly requests another language.";

  const contents = Array.isArray(input)
    ? input.map((message: any) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [
          {
            text:
              typeof message.content === "string"
                ? message.content
                : JSON.stringify(message.content),
          },
        ],
      }))
    : [
        {
          role: "user",
          parts: [
            {
              text: String(input),
            },
          ],
        },
      ];

  const body = {
    systemInstruction: {
      parts: [
        {
          text: system,
        },
      ],
    },
    contents,
    ...(maxOutputTokens ? { generationConfig: { maxOutputTokens } } : {}),
  };

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:` +
    `${stream ? "streamGenerateContent" : "generateContent"}` +
    `?key=${encodeURIComponent(apiKey)}` +
    `${stream ? "&alt=sse" : ""}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Gemini error ${response.status}: ${bodyText}`);
  }

  if (stream) {
    return {
      provider: "google",
      model,
      text: "",
      inputTokens: 0,
      outputTokens: 0,
      providerCostMicros: 0,
      stream: response.body!,
    };
  }

  const data: any = await response.json();
  const text = (data.candidates || [])
    .flatMap((candidate: any) => candidate.content?.parts || [])
    .map((part: any) => part.text || "")
    .join("");

  const usage = data.usageMetadata || {};
  const inputTokens = Number(usage.promptTokenCount || 0);
  const outputTokens = Number(usage.candidatesTokenCount || 0);

  return {
    provider: "google",
    model,
    text,
    inputTokens,
    outputTokens,
    providerCostMicros: costMicros("google", model, inputTokens, outputTokens),
  };
}

export async function resolveProvider(
  c: AppContext,
  projectId: string,
  requestedProvider?: string,
  chatServiceId?: string
): Promise<{
  mode: string;
  provider: string;
  apiKey?: string;
}> {
  const auth = c.get("auth") as AuthContext;

  let credential: any = null;
  let service: {
    provider_mode: string;
    ai_provider: string;
    provider_credential_id: string | null;
  } | null = null;

  if (chatServiceId) {
    service = await c.env.DB.prepare(
      `SELECT provider_mode, ai_provider, provider_credential_id
       FROM chat_services WHERE id = ? AND project_id = ? AND tenant_id = ?`
    )
      .bind(chatServiceId, projectId, auth.tenantId)
      .first();
    if (!service) return { mode: "invalid", provider: "", apiKey: undefined };
    requestedProvider =
      service.ai_provider === "auto" ? requestedProvider : service.ai_provider;
  }

  if (service?.provider_mode === "managed") {
    credential = null;
  } else if (service?.provider_mode === "tenant") {
    credential = await c.env.DB.prepare(
      `SELECT provider, encrypted_credentials FROM tenant_llm_credentials
       WHERE tenant_id = ? AND status = 'active'
         AND (? IS NULL OR provider = ?)
       ORDER BY updated_at DESC LIMIT 1`
    )
      .bind(
        auth.tenantId,
        requestedProvider || null,
        requestedProvider || null
      )
      .first();
    if (!credential && service.provider_credential_id) {
      credential = await c.env.DB.prepare(
        `SELECT provider, encrypted_credentials FROM provider_credentials
         WHERE id = ? AND tenant_id = ? AND project_id = ? AND status = 'active'`
      )
        .bind(service.provider_credential_id, auth.tenantId, projectId)
        .first();
    }
    if (!credential) {
      return { mode: "byok", provider: requestedProvider || "", apiKey: undefined };
    }
  } else if (service?.provider_mode === "tenant" && service.provider_credential_id) {
    credential = await c.env.DB.prepare(
      `SELECT provider, encrypted_credentials FROM provider_credentials
       WHERE id = ? AND tenant_id = ? AND project_id = ? AND status = 'active'`
    )
      .bind(service.provider_credential_id, auth.tenantId, projectId)
      .first();
  } else if (service?.provider_mode === "tenant") {
    credential = await c.env.DB.prepare(
      `SELECT provider, encrypted_credentials FROM provider_credentials
       WHERE tenant_id = ? AND project_id = ? AND status = 'active'
         AND (? IS NULL OR provider = ?)
       ORDER BY created_at DESC LIMIT 1`
    )
      .bind(
        auth.tenantId,
        projectId,
        requestedProvider || null,
        requestedProvider || null
      )
      .first();
  } else if (!service) {
    credential = await c.env.DB.prepare(
      `SELECT provider, encrypted_credentials FROM provider_credentials
       WHERE tenant_id = ? AND project_id = ? AND status = 'active'
         AND (? IS NULL OR provider = ?)
       ORDER BY created_at DESC LIMIT 1`
    )
      .bind(
        auth.tenantId,
        projectId,
        requestedProvider || null,
        requestedProvider || null
      )
      .first();
  } else if (requestedProvider) {
    credential = await c.env.DB.prepare(
      `
      SELECT
        provider,
        encrypted_credentials
      FROM provider_credentials
      WHERE tenant_id = ?
        AND project_id = ?
        AND provider = ?
        AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
      `
    )
      .bind(auth.tenantId, projectId, requestedProvider)
      .first();
  } else {
    credential = await c.env.DB.prepare(
      `
      SELECT
        provider,
        encrypted_credentials
      FROM provider_credentials
      WHERE tenant_id = ?
        AND project_id = ?
        AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
      `
    )
      .bind(auth.tenantId, projectId)
      .first();
  }

  if (credential) {
    return {
      mode: "byok",
      provider: credential.provider,
      apiKey: await decryptText(
        credential.encrypted_credentials,
        c.env.MASTER_KEY
      ),
    };
  }

  const primaryProvider =
    c.env.MANAGED_SECONDARY_PROVIDER_PRIMARY === "true" ? "openai" : "google";
  const secondaryProvider = primaryProvider === "google" ? "openai" : "google";
  const hasProviderKey = (provider: string) =>
    provider === "google"
      ? Boolean(c.env.GEMINI_API_KEY)
      : Boolean(c.env.OPENAI_API_KEY);
  const provider =
    requestedProvider ||
    (hasProviderKey(primaryProvider) ? primaryProvider : secondaryProvider);

  const apiKey =
    provider === "google" ? c.env.GEMINI_API_KEY : c.env.OPENAI_API_KEY;

  return {
    mode: "managed",
    provider,
    apiKey,
  };
}
