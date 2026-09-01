import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types";
import { id, now, jsonError, extractText } from "../utils/common";
import { requireApi } from "../utils/auth";
import {
  completeCreditReservation,
  refundCreditReservation,
  reserveCredits,
} from "../services/credits";
import { reserveUsage } from "../services/usage";
import {
  accumulateTokensFromStream,
  callGemini,
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
      "A valid dLogicAI API key is required.",
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

  const schema = z.object({
    model: z.string().default("auto"),
    provider: z.enum(["openai", "google"]).optional(),
    chat_service_id: z.string().optional(),
    input: z.any(),
    conversation_id: z.string().optional(),
    language: z.string().default("auto"),
    response_language: z.string().default("auto"),
    locale: z.string().optional(),
    stream: z.boolean().default(false),
  });

  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));

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

  const conversationId = parsed.data.conversation_id || id("conv");

  const dialogRuntime = await prepareDialogRuntime(
    c,
    projectId,
    parsed.data.chat_service_id,
    conversationId,
    textInput
  );

  const dialogContext = dialogRuntime
    ? `\n\nGuided conversation state:\nGoal: ${
        dialogRuntime.goal || "Complete the current conversation step."
      }\nInstruction: ${dialogRuntime.prompt}\nCollected slots: ${JSON.stringify(
        dialogRuntime.slots
      )}\nCurrent milestone: ${
        dialogRuntime.stateKey
      }\nDo not claim the business outcome is complete unless the configured flow reaches it.`
    : "";

  const knowledgeContext = await retrieveKnowledgeContext(
    c,
    projectId,
    parsed.data.chat_service_id,
    textInput
  );
  const providerContext = `${dialogContext}${knowledgeContext}`;
  const providerInput = providerContext
    ? Array.isArray(parsed.data.input)
      ? [{ role: "system", content: providerContext }, ...parsed.data.input]
      : `${String(parsed.data.input)}${providerContext}`
    : parsed.data.input;

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
    return jsonError(
      c,
      "NO_PROVIDER",
      "No AI provider is configured for this project.",
      400
    );
  }

  let model = parsed.data.model;

  if (model === "auto") {
    model =
      resolved.provider === "openai"
        ? "gpt-5-mini"
        : "gemini-2.5-flash-lite";
  }

  if (
    resolved.mode === "managed" &&
    !(
      (resolved.provider === "openai" && model === "gpt-5-mini") ||
      (resolved.provider === "google" && model === "gemini-2.5-flash-lite")
    )
  ) {
    return jsonError(
      c,
      "MANAGED_MODEL_NOT_AVAILABLE",
      "This model requires a tenant provider key. Managed AI supports the cost-controlled default model only.",
      402
    );
  }

  const idempotencyKey = c.req.header("Idempotency-Key")?.trim();
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
  const maxOutputTokens =
    resolved.mode === "managed" ? MANAGED_MAX_OUTPUT_TOKENS : undefined;
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

    /* -------------------------------------------------------------------- */
    /* STREAMING                                                            */
    /* -------------------------------------------------------------------- */

    if (parsed.data.stream) {
      const providerStream = result.stream!;
      const reader = providerStream.getReader();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      // Buffer to accumulate SSE lines for token extraction
      const streamBuffer: string[] = [];
      let partialLine = "";

      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();

            if (done) {
              // Stream ended: parse accumulated tokens and settle
              const tokens = accumulateTokensFromStream(
                resolved.provider,
                streamBuffer
              );

              // Calculate actual credit charge from real tokens
              const byokFee =
                resolved.mode === "byok"
                  ? Number(plan?.byok_request_fee_micros || 0)
                  : 0;
              const actualCredits =
                resolved.mode === "byok"
                  ? Math.max(byokFee, 1)
                  : managedCustomerChargeMicros(
                      plan,
                      resolved.provider,
                      model,
                      tokens.inputTokens,
                      tokens.outputTokens
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
                  tokens.inputTokens,
                  tokens.outputTokens,
                  tokens.inputTokens + tokens.outputTokens,
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
              );

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "response.completed",
                    request_id: requestId,
                    tokens: {
                      input: tokens.inputTokens,
                      output: tokens.outputTokens,
                    },
                  })}\n\n`
                )
              );

              controller.close();
              return;
            }

            // Accumulate SSE lines for later token parsing
            partialLine += decoder.decode(value, { stream: true });
            const lines = partialLine.split("\n");
            partialLine = lines.pop() || "";

            for (const line of lines) {
              if (line.trim()) {
                streamBuffer.push(line);
              }
            }

            // Forward the provider event to client
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "response.provider_event",
                  data: decoder.decode(value, { stream: true }),
                })}\n\n`
              )
            );
          } catch (error) {
            await c.env.DB.prepare(
              `UPDATE usage_events SET status = 'failed' WHERE request_id = ? AND status = 'reserved'`
            )
              .bind(requestId)
              .run();
            await refundCreditReservation(c, auth.tenantId, requestId);

            controller.error(error);
          }
        },

        async cancel() {
          await reader.cancel();
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
        dialogRuntime
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
});

export const responseRoutes = router;
