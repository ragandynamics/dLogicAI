import { getGuardrails, limitReply } from "../services/platform-guardrails";
import { featureAllowed } from '../services/platform-features';
import { widgetBehaviorContext, type WidgetBehavior } from "../services/widget-behavior";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoVariables, AppContext, AuthContext } from "../types";
import { id, now, jsonError, extractText } from "../utils/common";
import { requireApi } from "../utils/auth";
import {
  completeCreditReservation,
  refundCreditReservation,
  reserveCredits,
} from "../services/credits";
import { reserveUsage } from "../services/usage";
import {
  parseOpenAIStreamEvent,
  parseGeminiStreamEvent,
  callGemini,
  MANAGED_GEMINI_MODEL,
  callOpenAI,
  detectLanguage,
  estimatedCreditChargeMicros,
  MANAGED_MAX_OUTPUT_TOKENS,
  managedCustomerChargeMicros,
  resolveProvider,
} from "../services/providers";
import { recordConversationIntelligence } from "../services/intelligence";
import {
  persistDialogRuntime,
  prepareDialogRuntime,
} from "../services/dialog";
import { retrieveKnowledgeContext } from "../services/knowledge";
import { businessContext } from "../services/business-connectors";
import { verifyBusinessIdentity } from "../services/business-identity";

const router = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

router.post("/v1/responses", async (c) => {
  const auth = await requireApi(c);

  /*
   * IMPORTANT:
   * Never return null from a Hono route.
   */
  if (!auth) {
    return jsonError(
      c,
      "INVALID_API_KEY",
      "A valid dLogicFlow API key is required.",
      401
    );
  }

  const projectId = c.get("apiProjectId") as string;

  if (!projectId) {
    return jsonError(
      c,
      "AUTH_CONTEXT_ERROR",
      "API key has no project.",
      500
    );
  }

  return executeResponse(c, auth, projectId, await c.req.json().catch(() => ({})));
});

// Trusted callers must resolve tenant/project and constrain input before invoking.
export async function executeResponse(c: AppContext, auth: AuthContext, projectId: string, body: unknown, options?: { requestId: string; channel?: "web"; widgetBehavior?: WidgetBehavior; history?: { role: string; content: string }[] }) {
  c.set("auth", auth);
  c.set("apiProjectId", projectId);
  const schema = z.object({
    model: z.string().default("auto"),
    provider: z.enum(["openai", "google"]).optional(),
    chat_service_id: z.string().optional(),
    input: z.any(),
    conversation_id: z.string().optional(),
    language: z.string().default("auto"),
    response_language: z.string().default("auto"),
    locale: z.string().optional(),
    business_identity: z.string().max(8000).optional(),
    stream: z.boolean().default(false),
  });

  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return jsonError(c, "INVALID_REQUEST", "Invalid response request.");
  }

  if (parsed.data.stream && c.env.STREAMING_ENABLED !== "true") {
    return jsonError(
      c,
      "STREAMING_NOT_ENABLED",
      "Streaming responses are not enabled in this environment.",
      400
    );
  }

  if (parsed.data.conversation_id) {
    const paused = await c.env.DB.prepare(
      "SELECT auto_response_paused FROM conversations WHERE id = ? AND tenant_id = ?"
    )
      .bind(parsed.data.conversation_id, auth.tenantId)
      .first<{ auto_response_paused: number }>();
    if (paused?.auto_response_paused) {
      return jsonError(
        c,
        "AUTO_RESPONSE_PAUSED",
        "Automated responses are paused for this conversation.",
        409
      );
    }
  }

  const plan = await c.env.DB.prepare(
    `
    SELECT
      p.*,
      s.current_period_start
    FROM subscriptions s
    JOIN plans p
      ON p.id = s.plan_id
    WHERE s.tenant_id = ?
    `
  )
    .bind(auth.tenantId)
    .first<any>();

  const textInput = extractText(parsed.data.input);
  const limits = options?.channel ? await getGuardrails(c.env.DB, options.channel) : null;
  if (limits && !limits.enabled) return jsonError(c, "CHANNEL_DISABLED", "This channel is temporarily unavailable.", 503);
  if (limits && textInput.length > limits.max_input_characters) return jsonError(c, "INPUT_TOO_LARGE", "Your message exceeds this channel's input limit.", 400);

  const conversationId = parsed.data.conversation_id || id("conv");
  const businessRequestId = options?.requestId || c.req.header('Idempotency-Key')?.trim() || id('business-context');
  if(businessRequestId.length>200 || /[\r\n]/.test(businessRequestId))return jsonError(c,'INVALID_IDEMPOTENCY_KEY','Idempotency-Key must be at most 200 characters.',400);
  let subjects:Record<string,string>;
  try { subjects=await verifyBusinessIdentity(c.env.SESSION_SECRET,parsed.data.business_identity,{tenant:auth.tenantId,project:projectId,service:parsed.data.chat_service_id||'',conversation:conversationId}); }
  catch { return jsonError(c,'INVALID_CUSTOMER_IDENTITY','Customer verification expired or does not match this conversation.',401); }

  const dialogRuntime = options?.widgetBehavior && options.widgetBehavior.conversation_template !== "service" ? null : await prepareDialogRuntime(
    c,
    projectId,
    parsed.data.chat_service_id,
    conversationId,
    textInput
  );

  const existingConversation = parsed.data.conversation_id ? await c.env.DB.prepare('SELECT created_at FROM conversations WHERE id=? AND tenant_id=? AND project_id=?').bind(conversationId,auth.tenantId,projectId).first<{created_at:number}>() : null;
  const experience = dialogRuntime || (options?.widgetBehavior && options.widgetBehavior.conversation_template !== 'service') ? 'chat.guided' : 'chat.qa';
  for(const feature of [experience,...(options?.channel?['channel.'+options.channel]:[])]) {
    if(!await featureAllowed(c.env.DB,feature,auth.tenantId,existingConversation?.created_at))return jsonError(c,'FEATURE_UNAVAILABLE','This experience is currently unavailable. Your saved conversation is retained.',403);
  }
  const dialogContext = dialogRuntime
    ? `\n\nGuided conversation state:\nGoal: ${
        dialogRuntime.goal || "Complete the current conversation step."
      }\nInstruction: ${dialogRuntime.prompt}\nCollected slots: ${JSON.stringify(
        dialogRuntime.slots
      )}\nCurrent milestone: ${
        dialogRuntime.stateKey
      }\nA completed conversation step is not evidence of an external action. Connector actions require operator approval and a successful external receipt.`
    : "";

  const knowledgeContext = await retrieveKnowledgeContext(
    c,
    projectId,
    parsed.data.chat_service_id,
    textInput
  );
  const connectorContext = await businessContext(c,projectId,parsed.data.chat_service_id,textInput,businessRequestId,subjects,options?.widgetBehavior?.business_data_enabled===false,conversationId);
  const providerContext = `${limits ? `\nLimit the reply to at most ${limits.max_outputs} paragraphs or list entries and ${limits.max_output_characters} characters.\n` : ""}${dialogContext}${knowledgeContext}${connectorContext}${options?.widgetBehavior ? widgetBehaviorContext(options.widgetBehavior) : ""}`;
  const input = options?.history ? [...options.history, { role: "user", content: textInput }] : parsed.data.input;
  const providerInput = providerContext
    ? Array.isArray(input)
      ? [{ role: "system", content: providerContext }, ...input]
      : `${String(input)}${providerContext}`
    : input;

  const inputLanguage =
    parsed.data.language === "auto"
      ? await detectLanguage(textInput)
      : parsed.data.language;

  const resolved = await resolveProvider(
    c,
    projectId,
    parsed.data.provider,
    parsed.data.chat_service_id
  );

  if (!resolved.apiKey) {
    const tenantKeyRequired = resolved.mode === "byok";
    return jsonError(
      c,
      "NO_PROVIDER",
      tenantKeyRequired
        ? "This Chat Service is set to use a tenant key, but no matching active key was found. Select Google Gemini and save an active Gemini key."
        : "This Chat Service is set to managed AI, but its provider is unavailable in this environment.",
      400
    );
  }

  let model = parsed.data.model;

  if (model === "auto") {
    model =
      resolved.provider === "openai"
        ? "gpt-5-mini"
        : MANAGED_GEMINI_MODEL;
  }
  if (resolved.provider === "google" && model === "gemini-2.5-flash-lite") {
    model = MANAGED_GEMINI_MODEL;
  }

  if (
    resolved.mode === "managed" &&
    !(
      (resolved.provider === "openai" && model === "gpt-5-mini") ||
      (resolved.provider === "google" && model === MANAGED_GEMINI_MODEL)
    )
  ) {
    return jsonError(
      c,
      "MANAGED_MODEL_NOT_AVAILABLE",
      "This model requires a tenant provider key. Managed AI supports the cost-controlled default model only.",
      402
    );
  }

  const idempotencyKey = options?.requestId || c.req.header("Idempotency-Key")?.trim();
  if (
    idempotencyKey &&
    (idempotencyKey.length > 200 || /[\r\n]/.test(idempotencyKey))
  ) {
    return jsonError(
      c,
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key must be at most 200 characters.",
      400
    );
  }
  const requestId = idempotencyKey || id("req");
  const maxOutputTokens = limits ? Math.min(limits.max_output_tokens, resolved.mode === "managed" ? MANAGED_MAX_OUTPUT_TOKENS : limits.max_output_tokens) : resolved.mode === "managed" ? MANAGED_MAX_OUTPUT_TOKENS : undefined;
  const estimatedCredits = estimatedCreditChargeMicros(
    plan,
    resolved.mode,
    resolved.provider,
    model,
    providerInput
  );

  const creditReservation = await reserveCredits(
    c,
    auth.tenantId,
    requestId,
    projectId,
    estimatedCredits
  );

  if (!creditReservation.ok) {
    return jsonError(
      c,
      creditReservation.code ?? "BILLING_ERROR",
      creditReservation.code === "IDEMPOTENCY_KEY_REUSED"
        ? "This idempotency key has already been used for a different request."
        : creditReservation.code === "NO_CREDIT_ACCOUNT"
        ? "No AI credit account is configured for this tenant."
        : "Insufficient AI credits. Please purchase additional credits or wait for your subscription credits to renew.",
      creditReservation.code === "IDEMPOTENCY_KEY_REUSED" ? 409 : 402
    );
  }

  if (creditReservation.idempotent) {
    return jsonError(c, "IDEMPOTENCY_KEY_REUSED", "This request has already been submitted.", 409);
  }

  const t = now();

  const outputLanguage =
    parsed.data.response_language === "auto"
      ? inputLanguage
      : parsed.data.response_language;

  /*
   * Reserve quota BEFORE provider call.
   */
  const reserved = await reserveUsage(
    c,
    plan,
    requestId,
    projectId,
    resolved.provider,
    model,
    resolved.mode,
    inputLanguage,
    outputLanguage
  );

  if (!reserved) {
    await refundCreditReservation(c, auth.tenantId, requestId);
    return jsonError(
      c,
      "QUOTA_EXCEEDED",
      "Monthly API request quota exceeded.",
      402
    );
  }

  try {
    const result =
      resolved.provider === "openai"
        ? await callOpenAI(
            c.env,
            resolved.apiKey,
            model,
            providerInput,
            parsed.data.response_language,
            parsed.data.stream,
            maxOutputTokens
          )
        : await callGemini(
            c.env,
            resolved.apiKey,
            model,
            providerInput,
            parsed.data.response_language,
            parsed.data.stream,
            maxOutputTokens
          );

    if (limits && !parsed.data.stream) result.text = limitReply(result.text, limits);

    /* -------------------------------------------------------------------- */
    /* STREAMING                                                            */
    /* -------------------------------------------------------------------- */

    if (parsed.data.stream) {
      const providerStream = result.stream!;
      const reader = providerStream.getReader();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      // State to accumulate tokens from provider events
      let finalTokens = { inputTokens: 0, outputTokens: 0 };
      let partialLine = "";
      let hasUsage = false;
      const parseUsageLine = (line: string) => {
        if (!line.startsWith("data:")) return;
        const eventData = line.slice(5).trim();
        if (!eventData || eventData === "[DONE]") return;
        const parsed = resolved.provider === "openai"
          ? parseOpenAIStreamEvent(eventData)
          : parseGeminiStreamEvent(eventData);
        if (Number.isSafeInteger(parsed.inputTokens) && Number(parsed.inputTokens) >= 0 &&
            Number.isSafeInteger(parsed.outputTokens) && Number(parsed.outputTokens) >= 0) {
          finalTokens = { inputTokens: Number(parsed.inputTokens), outputTokens: Number(parsed.outputTokens) };
          hasUsage = true;
        }
      };

      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();

            if (done) {
              parseUsageLine(partialLine + decoder.decode());
              if (!hasUsage) throw new Error("Provider stream ended without usage.");
              // Calculate actual credit charge from real tokens
              const byokFee =
                resolved.mode === "byok"
                  ? Number(plan?.byok_request_fee_micros || 0)
                  : 0;
              const actualCredits =
                resolved.mode === "byok"
                  ? byokFee
                  : managedCustomerChargeMicros(
                      plan,
                      resolved.provider,
                      model,
                      finalTokens.inputTokens,
                      finalTokens.outputTokens
                    );

              // Update usage_events with actual token counts
              await c.env.DB.prepare(
                `UPDATE usage_events
                 SET status = 'completed', 
                     input_tokens = ?,
                     output_tokens = ?,
                     total_tokens = ?,
                     customer_charge_micros = ?,
                     completed_at = ?
                 WHERE request_id = ? AND status = 'reserved'`
              )
                .bind(
                  finalTokens.inputTokens,
                  finalTokens.outputTokens,
                  finalTokens.inputTokens + finalTokens.outputTokens,
                  actualCredits,
                  now(),
                  requestId
                )
                .run();

              // Complete credit reservation with actual token-based charge
              await completeCreditReservation(
                c,
                auth.tenantId,
                requestId,
                actualCredits
              );

              // Record conversation intelligence (non-streaming has this too)
              await recordConversationIntelligence(
                c,
                conversationId,
                requestId,
                textInput,
                ""
              ).catch(() => undefined);

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "response.completed",
                    request_id: requestId,
                    tokens: {
                      input: finalTokens.inputTokens,
                      output: finalTokens.outputTokens,
                    },
                  })}\n\n`
                )
              );

              controller.close();
              return;
            }

            const chunk = decoder.decode(value, { stream: true });

            // Forward the provider event to client immediately
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "response.provider_event",
                  data: chunk,
                })}\n\n`
              )
            );

            // Parse usage data from chunk without buffering the entire stream
            partialLine += chunk;
            const lines = partialLine.split("\n");
            partialLine = lines.pop() || "";

            for (const line of lines) {
              parseUsageLine(line);
            }
          } catch (error) {
            await c.env.DB.prepare(
              `UPDATE usage_events SET status = 'failed' WHERE request_id = ? AND status = 'reserved'`
            )
              .bind(requestId)
              .run();
            await refundCreditReservation(c, auth.tenantId, requestId);

            controller.error(new Error("AI provider stream failed."));
          }
        },

        async cancel() {
          await reader.cancel().catch(() => undefined);
          await c.env.DB.prepare(
            `UPDATE usage_events SET status = 'failed' WHERE request_id = ? AND status = 'reserved'`
          )
            .bind(requestId)
            .run();
          await refundCreditReservation(c, auth.tenantId, requestId);
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Request-ID": requestId,
        },
      });
    }

    /* -------------------------------------------------------------------- */
    /* NON-STREAMING                                                        */
    /* -------------------------------------------------------------------- */

    const byokFee =
      resolved.mode === "byok"
        ? Number(plan?.byok_request_fee_micros || 0)
        : 0;

    const customerCharge =
      resolved.mode === "byok"
        ? byokFee
        : managedCustomerChargeMicros(
            plan,
            resolved.provider,
            model,
            result.inputTokens,
            result.outputTokens
          );

    /*
     * Complete the reservation
     * and persist conversation data
     * in one D1 batch.
     */
    await c.env.DB.batch([
      c.env.DB.prepare(
        `
        INSERT INTO conversations (
          id,
          tenant_id,
          project_id,
          title,
          model,
          language,
          locale,
          created_at,
          updated_at
        )
        VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id)
        DO UPDATE SET
          updated_at = excluded.updated_at,
          model = excluded.model,
          language = excluded.language,
          locale = excluded.locale
        `
      ).bind(
        conversationId,
        auth.tenantId,
        projectId,
        textInput.slice(0, 100),
        model,
        inputLanguage,
        parsed.data.locale || null,
        t,
        t
      ),

      c.env.DB.prepare(
        `
        INSERT INTO messages (
          id,
          conversation_id,
          role,
          content,
          input_tokens,
          output_tokens,
          created_at
        )
        VALUES (?,?,?,?,?,?,?)
        `
      ).bind(
        id("msg"),
        conversationId,
        "user",
        textInput,
        result.inputTokens,
        result.outputTokens,
        t
      ),

      c.env.DB.prepare(
        `
        INSERT INTO messages (
          id,
          conversation_id,
          role,
          content,
          input_tokens,
          output_tokens,
          created_at
        )
        VALUES (?,?,?,?,?,?,?)
        `
      ).bind(
        id("msg"),
        conversationId,
        "assistant",
        result.text,
        result.inputTokens,
        result.outputTokens,
        t
      ),

      c.env.DB.prepare(
        `
        UPDATE usage_events
        SET
          status = 'completed',
          input_tokens = ?,
          output_tokens = ?,
          total_tokens = ?,
          provider_cost_micros = ?,
          customer_charge_micros = ?
        WHERE request_id = ?
          AND status = 'reserved'
        `
      ).bind(
        result.inputTokens,
        result.outputTokens,
        result.inputTokens + result.outputTokens,
        result.providerCostMicros,
        customerCharge,
        requestId
      ),
    ]);

    await completeCreditReservation(c, auth.tenantId, requestId, customerCharge);
    if (dialogRuntime && parsed.data.chat_service_id) {
      await persistDialogRuntime(
        c,
        conversationId,
        projectId,
        parsed.data.chat_service_id,
        dialogRuntime,
        options?.widgetBehavior?.business_data_enabled!==false
      );
    }
    await recordConversationIntelligence(
      c,
      conversationId,
      requestId,
      textInput,
      result.text
    ).catch(() => undefined);

    return c.json({
      id: requestId,
      conversation_id: conversationId,
      model,
      provider: resolved.provider,
      billing_mode: resolved.mode,
      output_text: result.text,
      language: {
        input: inputLanguage,
        output: outputLanguage,
        locale: parsed.data.locale || null,
      },
      usage: {
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        total_tokens: result.inputTokens + result.outputTokens,
      },
    });
  } catch {
    /*
     * IMPORTANT:
     * Release the reservation by marking
     * the request as failed.
     */
    await c.env.DB.prepare(
      `
      UPDATE usage_events
      SET status = 'failed'
      WHERE request_id = ?
        AND status = 'reserved'
      `
    )
      .bind(requestId)
      .run()
      .catch(() => undefined);

    await refundCreditReservation(c, auth.tenantId, requestId).catch(
      () => undefined
    );

    console.error("DLOGICAI_PROVIDER_ERROR", {
      requestId,
      tenantId: auth.tenantId,
      projectId,
      provider: resolved.provider,
      model,
    });

    return jsonError(
      c,
      "PROVIDER_ERROR",
      "AI provider request failed.",
      502
    );
  }
}

export const responseRoutes = router;
