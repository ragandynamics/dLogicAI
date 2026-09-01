import { z } from "zod";
import type { AppContext } from "../types";
import { id, now } from "../utils/common";

export const dialogFlowSchema = z.object({
  name: z.string().trim().min(1).max(120),
  entry_state_key: z.string().trim().min(1).max(120),
  states: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(120),
        type: z.enum([
          "greeting",
          "question",
          "qualification",
          "recommendation",
          "confirmation",
          "handoff",
          "completed",
          "abandoned",
        ]),
        goal: z.string().trim().max(500).optional().default(""),
        prompt: z.string().trim().min(1).max(4000),
        required_slots: z
          .array(z.string().trim().min(1).max(120))
          .max(50)
          .default([]),
        knowledge_base_ids: z
          .array(z.string().trim().min(1).max(120))
          .max(50)
          .default([]),
        max_retries: z.number().int().min(0).max(10).default(2),
      })
    )
    .min(1)
    .max(100),
  transitions: z
    .array(
      z.object({
        from: z.string().trim().min(1).max(120),
        to: z.string().trim().min(1).max(120),
        conditions: z.array(z.record(z.string(), z.unknown())).max(50).default([]),
        priority: z.number().int().min(-1000).max(1000).default(0),
      })
    )
    .max(300)
    .default([]),
  outcomes: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(120),
        label: z.string().trim().min(1).max(200),
        actions: z.array(z.record(z.string(), z.unknown())).max(50).default([]),
      })
    )
    .max(100)
    .default([]),
});

export type DialogRuntime = {
  flowVersionId: string;
  stateKey: string;
  stateType: string;
  goal: string | null;
  prompt: string;
  slots: Record<string, string>;
  milestones: string[];
  nextStateKey: string;
  completedOutcomeKey: string | null;
};

export function runtimeConditionValue(
  condition: Record<string, unknown>,
  slots: Record<string, string>,
  intent: string,
  sentiment: string,
  stateKey: string
): string | undefined {
  const field = String(condition.field || "");
  if (field.startsWith("slots.")) return slots[field.slice(6)];
  if (field === "intent") return intent;
  if (field === "sentiment") return sentiment;
  if (field === "state") return stateKey;
  return undefined;
}

export function matchesRuntimeCondition(
  condition: Record<string, unknown>,
  slots: Record<string, string>,
  intent: string,
  sentiment: string,
  stateKey: string
): boolean {
  const value = runtimeConditionValue(
    condition,
    slots,
    intent,
    sentiment,
    stateKey
  );
  const operator = String(condition.operator || "exists");
  if (operator === "exists") return value !== undefined && value !== "";
  if (operator === "equals")
    return String(value ?? "") === String(condition.value ?? "");
  if (operator === "contains")
    return String(value ?? "")
      .toLowerCase()
      .includes(String(condition.value ?? "").toLowerCase());
  return false;
}

export function classifyDialogIntent(text: string): string {
  if (
    /\b(invoice|billing|charged|charge|payment|receipt|subscription|refund)\b/i.test(
      text
    )
  )
    return "billing";
  if (/\b(buy|purchase|price|pricing|demo|subscribe)\b/i.test(text))
    return "purchase";
  if (/\b(complaint|manager|cancel)\b/i.test(text)) return "support_escalation";
  return "general_enquiry";
}

export function extractRuntimeSlots(
  text: string,
  requiredSlots: string[],
  currentSlots: Record<string, string>
): Record<string, string> {
  const slots = { ...currentSlots };
  for (const slot of requiredSlots) {
    const pattern = new RegExp(
      `\\b${slot.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*(?:is|:|=)\\s*([^,.;\\n]+)`,
      "i"
    );
    const match = text.match(pattern);
    if (match?.[1]) slots[slot] = match[1].trim().slice(0, 200);
  }
  if (requiredSlots.includes("email")) {
    const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i)?.[0];
    if (email) slots.email = email;
  }
  return slots;
}

export async function prepareDialogRuntime(
  c: AppContext,
  projectId: string,
  serviceId: string | undefined,
  conversationId: string,
  inputText: string
): Promise<DialogRuntime | null> {
  if (!serviceId) return null;
  const flow = await c.env.DB.prepare(
    `SELECT f.active_version_id, v.entry_state_key
     FROM dialog_flows f JOIN dialog_flow_versions v ON v.id = f.active_version_id
     WHERE f.chat_service_id = ? AND f.project_id = ? AND f.tenant_id = ?`
  )
    .bind(serviceId, projectId, c.get("auth")?.tenantId)
    .first<{ active_version_id: string; entry_state_key: string }>();
  if (!flow) return null;

  const saved = await c.env.DB.prepare(
    `SELECT current_state_key, retry_count, slots_json, milestones_json, flow_version_id
     FROM conversation_flow_state WHERE conversation_id = ? AND tenant_id = ?`
  )
    .bind(conversationId, c.get("auth")?.tenantId)
    .first<{
      current_state_key: string;
      retry_count: number;
      slots_json: string;
      milestones_json: string;
      flow_version_id: string;
    }>();

  const currentStateKey =
    saved?.flow_version_id === flow.active_version_id
      ? saved.current_state_key
      : flow.entry_state_key;

  const current = await c.env.DB.prepare(
    `SELECT state_key, state_type, goal, prompt, required_slots_json FROM dialog_states WHERE flow_version_id = ? AND state_key = ? AND tenant_id = ?`
  )
    .bind(flow.active_version_id, currentStateKey, c.get("auth")?.tenantId)
    .first<{
      state_key: string;
      state_type: string;
      goal: string | null;
      prompt: string;
      required_slots_json: string;
    }>();
  if (!current) return null;

  const slots = extractRuntimeSlots(
    inputText,
    JSON.parse(current.required_slots_json || "[]"),
    saved ? JSON.parse(saved.slots_json || "{}") : {}
  );
  const lower = inputText.toLowerCase();
  const intent = classifyDialogIntent(lower);
  const sentiment = /\b(angry|unacceptable|frustrated|terrible|complaint)\b/.test(
    lower
  )
    ? "negative"
    : "neutral";

  const transitions = await c.env.DB.prepare(
    `SELECT to_state_key, conditions_json FROM dialog_transitions WHERE flow_version_id = ? AND from_state_key = ? AND tenant_id = ? ORDER BY priority DESC`
  )
    .bind(flow.active_version_id, currentStateKey, c.get("auth")?.tenantId)
    .all<{ to_state_key: string; conditions_json: string }>();

  const next =
    transitions.results.find((transition) =>
      (
        JSON.parse(transition.conditions_json || "[]") as Record<
          string,
          unknown
        >[]
      ).every((condition) =>
        matchesRuntimeCondition(
          condition,
          slots,
          intent,
          sentiment,
          currentStateKey
        )
      )
    )?.to_state_key || currentStateKey;

  const milestones = saved
    ? (JSON.parse(saved.milestones_json || "[]") as string[])
    : [];
  if (
    next !== currentStateKey &&
    !milestones.includes(`state:${currentStateKey}`)
  )
    milestones.push(`state:${currentStateKey}`);

  const target =
    next !== currentStateKey
      ? await c.env.DB.prepare(
          "SELECT state_type FROM dialog_states WHERE flow_version_id = ? AND state_key = ? AND tenant_id = ?"
        )
          .bind(flow.active_version_id, next, c.get("auth")?.tenantId)
          .first<{ state_type: string }>()
      : null;

  const completedOutcomeKey =
    target && ["completed", "abandoned", "handoff"].includes(target.state_type)
      ? (
          await c.env.DB.prepare(
            "SELECT outcome_key FROM dialog_outcomes WHERE flow_version_id = ? AND tenant_id = ? AND outcome_key LIKE ? LIMIT 1"
          )
            .bind(
              flow.active_version_id,
              c.get("auth")?.tenantId,
              `%${target.state_type}%`
            )
            .first<{ outcome_key: string }>()
        )?.outcome_key || null
      : null;

  return {
    flowVersionId: flow.active_version_id,
    stateKey: currentStateKey,
    stateType: current.state_type,
    goal: current.goal,
    prompt: current.prompt,
    slots,
    milestones,
    nextStateKey: next,
    completedOutcomeKey,
  };
}

export async function persistDialogRuntime(
  c: AppContext,
  conversationId: string,
  projectId: string,
  serviceId: string,
  runtime: DialogRuntime
): Promise<void> {
  const timestamp = now();
  await c.env.DB.prepare(
    `INSERT INTO conversation_flow_state (conversation_id, tenant_id, project_id, chat_service_id, flow_version_id, current_state_key, retry_count, slots_json, milestones_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
     ON CONFLICT(conversation_id) DO UPDATE SET current_state_key = excluded.current_state_key, flow_version_id = excluded.flow_version_id, slots_json = excluded.slots_json, milestones_json = excluded.milestones_json, updated_at = excluded.updated_at`
  )
    .bind(
      conversationId,
      c.get("auth")?.tenantId,
      projectId,
      serviceId,
      runtime.flowVersionId,
      runtime.nextStateKey,
      JSON.stringify(runtime.slots),
      JSON.stringify(runtime.milestones),
      timestamp
    )
    .run();

  if (runtime.completedOutcomeKey) {
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO conversation_outcome_events (id, tenant_id, conversation_id, flow_version_id, outcome_key, evidence_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id("outev"),
        c.get("auth")?.tenantId,
        conversationId,
        runtime.flowVersionId,
        runtime.completedOutcomeKey,
        JSON.stringify({ state: runtime.nextStateKey, slots: runtime.slots }),
        timestamp
      )
      .run();
  }
}
