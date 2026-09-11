import { describe, expect, it } from "vitest";
import { channelAdapters } from "../src/integrations/channel-adapters";

describe("channel adapters", () => {
  it("normalizes a Telegram message using update and chat identifiers", () => {
    const adapter = channelAdapters.get("telegram");
    const messages = adapter?.parseInbound(JSON.stringify({
      update_id: 42,
      message: {
        message_id: 7,
        chat: { id: 123, type: "private" },
        from: { id: 456, first_name: "Ada", last_name: "Lovelace" },
        text: "I need help",
      },
    }));

    expect(messages).toEqual([expect.objectContaining({
      channel: "telegram",
      external_message_id: "42",
      external_conversation_id: "123",
      external_sender_id: "456",
      sender_name: "Ada Lovelace",
      text: "I need help",
    })]);
  });

  it("normalizes WhatsApp text messages and ignores status-only payloads", () => {
    const adapter = channelAdapters.get("whatsapp");
    const messages = adapter?.parseInbound(JSON.stringify({
      entry: [{ changes: [{ value: {
        metadata: { phone_number_id: "phone-1" },
        messages: [{ id: "wamid-1", from: "15551234567", type: "text", text: { body: "Hello" } }],
      } }] }],
    }));

    expect(messages).toEqual([expect.objectContaining({
      channel: "whatsapp",
      external_message_id: "wamid-1",
      external_conversation_id: "15551234567",
      external_sender_id: "15551234567",
      text: "Hello",
    })]);
    expect(adapter?.parseInbound(JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: "status-1" }] } }] }] }))).toEqual([]);
  });
});
