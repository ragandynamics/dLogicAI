import type { AppContext } from "../types";
import { id, now } from "../utils/common";

export function scoreSignal(text: string, terms: string[]): number {
  return terms.some((term) => text.includes(term)) ? 75 : 0;
}

export async function recordConversationIntelligence(
  c: AppContext,
  conversationId: string,
  requestId: string,
  inputText: string,
  outputText: string
): Promise<void> {
  const auth = c.get("auth");
  if (!auth) return;

  const text = `${inputText} ${outputText}`.toLowerCase();
  const urgencyScore = scoreSignal(text, [
    "urgent",
    "asap",
    "immediately",
    "emergency",
    "angry",
  ]);
  const frustrationScore = scoreSignal(text, [
    "frustrated",
    "unacceptable",
    "still not",
    "terrible",
    "angry",
  ]);
  const purchaseIntentScore = scoreSignal(text, [
    "buy",
    "purchase",
    "pricing",
    "price",
    "plan",
    "subscribe",
    "demo",
  ]);
  const escalationRiskScore = scoreSignal(text, [
    "manager",
    "complaint",
    "lawsuit",
    "cancel",
    "speak to a person",
  ]);
  const sentiment =
    frustrationScore > 0 || escalationRiskScore > 0
      ? "negative"
      : purchaseIntentScore > 0
        ? "positive"
        : "neutral";
  const emotion =
    frustrationScore > 0
      ? "frustrated"
      : urgencyScore > 0
        ? "urgent"
        : purchaseIntentScore > 0
          ? "interested"
          : "calm";
  const intent =
    purchaseIntentScore > 0
      ? "purchase"
      : escalationRiskScore > 0
        ? "support_escalation"
        : "general_enquiry";
  const businessEvent =
    purchaseIntentScore > 0
      ? "purchase_intent"
      : escalationRiskScore > 0
        ? "escalation_risk"
        : null;
  const nextBestAction =
    escalationRiskScore > 0
      ? "Offer a human handoff."
      : purchaseIntentScore > 0
        ? "Provide the relevant plan or next sales step."
        : "Continue the conversation and monitor for escalation.";

  await c.env.DB.prepare(
    `INSERT INTO conversation_intelligence (
      id, conversation_id, request_id, intent, intent_confidence, sentiment, emotion,
      frustration_score, urgency_score, customer_effort_score, confusion_score,
      purchase_intent_score, upsell_probability, cross_sell_probability,
      churn_risk_score, escalation_risk_score, refund_risk_score,
      conversion_probability, abandonment_probability, next_best_action,
      business_event, business_event_severity, human_handoff_recommended,
      topics_json, entities_json, preferences_json, constraints_json, created_at
    )
    SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, 0, 0, ?, 0, ?, 0, ?, ?, ?, ?, '[]', '[]', '[]', '[]', ?
    FROM conversations
    WHERE id = ? AND tenant_id = ?`
  )
    .bind(
      id("intel"),
      requestId,
      intent,
      purchaseIntentScore > 0 || escalationRiskScore > 0 ? 80 : 55,
      sentiment,
      emotion,
      frustrationScore,
      urgencyScore,
      purchaseIntentScore,
      escalationRiskScore,
      purchaseIntentScore,
      nextBestAction,
      businessEvent,
      escalationRiskScore > 0 ? "high" : businessEvent ? "medium" : null,
      escalationRiskScore > 0 ? 1 : 0,
      now(),
      conversationId,
      auth.tenantId
    )
    .run();
}
