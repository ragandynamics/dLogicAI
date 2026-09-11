import { z } from "zod";

export const widgetBehaviorSchema = z.object({
  conversation_template: z.enum(["service", "support", "leads", "booking", "custom"]).default("service"),
  output_template: z.enum(["default", "concise", "bullets", "steps"]).default("default"),
  conversation_instructions: z.string().trim().max(2000).default(""),
  business_data_enabled: z.boolean().default(true),
});
export type WidgetBehavior = z.infer<typeof widgetBehaviorSchema>;
const flows = {
  service: "",
  support: "Understand the customer's issue, ask one clarifying question at a time, suggest a relevant solution, then check whether it helped. Offer human follow-up when unresolved.",
  leads: "Ask about the customer's goal, requirements and timeline one question at a time. Summarize their needs and offer an appropriate next step. Ask permission before requesting contact details.",
  booking: "Ask which service the customer needs, then their preferred date and time. Summarize the request. Never claim a booking is confirmed without confirmation from a booking system.",
  custom: "Follow the widget's configured conversation instructions, asking one question at a time when information is missing.",
};
const formats = {
  default: "Reply in natural, readable plain-text paragraphs.",
  concise: "Keep the reply to one short paragraph, normally two or three sentences. Include essential qualifications.",
  bullets: "Use short plain-text bullet points prefixed with •. Keep each point focused on one idea.",
  steps: "Use a numbered plain-text list for actionable steps. Put each step on its own line.",
};
export function widgetBehaviorContext(behavior: WidgetBehavior): string {
  return `\n\nWidget conversation guidance:\n${flows[behavior.conversation_template]}\n${behavior.conversation_instructions}\nReply format:\n${formats[behavior.output_template]}\nDo not emit HTML. Do not invent business facts or claim external actions were completed.`;
}
