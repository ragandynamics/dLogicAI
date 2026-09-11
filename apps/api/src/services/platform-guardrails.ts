import { z } from "zod";
export const guardrailsSchema = z.object({
  enabled: z.boolean().default(true),
  max_input_characters: z.number().int().min(100).max(4000).default(4000),
  max_output_tokens: z.number().int().min(64).max(8192).default(512),
  max_outputs: z.number().int().min(1).max(50).default(10),
  max_output_characters: z.number().int().min(100).max(20000).default(4000),
}).strict();
export type Guardrails = z.infer<typeof guardrailsSchema>;
export const platformSchema = z.object({ ai_enabled: z.boolean(), support_email: z.union([z.literal(""), z.string().email().max(254)]) }).strict();
export async function getGuardrails(db: D1Database, channel: string): Promise<Guardrails> {
  const rows = await db.prepare("SELECT key, value_json FROM platform_settings WHERE key IN ('platform', ?)").bind("channel." + channel).all<{ key: string; value_json: string }>();
  const channelConfig = rows.results.find(row => row.key === "channel." + channel);
  const globalConfig = rows.results.find(row => row.key === "platform");
  const result = guardrailsSchema.parse(channelConfig ? JSON.parse(channelConfig.value_json) : {});
  if (globalConfig && !platformSchema.parse(JSON.parse(globalConfig.value_json)).ai_enabled) result.enabled = false;
  return result;
}
// A reply item is a nonempty paragraph or a list entry, including continuation lines.
export function limitReply(text: string, limits: Guardrails): string {
  const chunks = text.trim().split(/\n\s*\n|\n(?=\s*(?:[-*•]|\d+[.)])\s)/).filter(s => s.trim());
  return chunks.slice(0, limits.max_outputs).join("\n\n").slice(0, limits.max_output_characters);
}
