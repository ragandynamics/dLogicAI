import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reserveCredits: vi.fn(),
  reserveUsage: vi.fn(),
  completeCreditReservation: vi.fn(),
  refundCreditReservation: vi.fn(),
  resolveProvider: vi.fn(),
  callGemini: vi.fn(),
  callOpenAI: vi.fn(),
}));

vi.mock("../src/services/credits", () => ({
  reserveCredits: mocks.reserveCredits,
  completeCreditReservation: mocks.completeCreditReservation,
  refundCreditReservation: mocks.refundCreditReservation,
}));

vi.mock("../src/services/usage", () => ({ reserveUsage: mocks.reserveUsage }));

vi.mock("../src/services/providers", () => ({
  resolveProvider: mocks.resolveProvider,
  callGemini: mocks.callGemini,
  callOpenAI: mocks.callOpenAI,
  estimatedCreditChargeMicros: () => 100,
  managedCustomerChargeMicros: () => 40,
  MANAGED_MAX_OUTPUT_TOKENS: 512,
  MANAGED_GEMINI_MODEL: "gemini-3.5-flash-lite",
}));

import { processChannelInbound } from "../src/services/channels";

class Statement {
  constructor(private db: FakeDb, private sql: string) {}
  bind(...values: unknown[]) {
    this.db.bindings.push({ sql: this.sql, values });
    return this;
  }
  async first<T>() {
    if (this.sql.includes("FROM channel_installations i")) return this.db.installation as T;
    if (this.sql.includes("SELECT status FROM usage_events")) return this.db.usage as T;
    if (this.sql.includes("FROM subscriptions s")) return this.db.plan as T;
    return null;
  }
  async all<T>() {
    if (this.sql.includes("FROM messages")) return { results: this.db.messages } as { results: T[] };
    return { results: [] as T[] };
  }
  async run() {
    this.db.runs.push(this.sql);
    return { meta: { changes: 1 } };
  }
}

class FakeDb {
  installation = {
    id: "install_1",
    tenant_id: "tenant_1",
    project_id: "project_1",
    chat_service_id: "service_1",
    channel: "telegram",
    external_conversation_id: "chat_1",
    auto_response_paused: 0,
  };
  usage: { status: string } | null = null;
  plan = { included_requests: 100, current_period_start: 0 };
  messages = [{ role: "user", content: "Hello" }];
  bindings: Array<{ sql: string; values: unknown[] }> = [];
  runs: string[] = [];
  batches: unknown[][] = [];
  batchError: Error | null = null;
  prepare(sql: string) { return new Statement(this, sql); }
  async batch(statements: unknown[]) {
    if (this.batchError) throw this.batchError;
    this.batches.push(statements);
    return statements.map(() => ({ meta: { changes: 1 } }));
  }
}

const item = {
  type: "channel.inbound" as const,
  tenantId: "tenant_1",
  installationId: "install_1",
  eventId: "event_1",
  conversationId: "conversation_1",
  messageId: "message_1",
  text: "Hello",
};

describe("channel inbound runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveProvider.mockResolvedValue({ mode: "managed", provider: "google", apiKey: "test-key" });
    mocks.reserveCredits.mockResolvedValue({ ok: true, reserved: 100 });
    mocks.reserveUsage.mockResolvedValue(true);
    mocks.completeCreditReservation.mockResolvedValue(undefined);
    mocks.refundCreditReservation.mockResolvedValue(undefined);
    mocks.callGemini.mockResolvedValue({
      provider: "google",
      model: "gemini-3.5-flash-lite",
      text: "Hi there",
      inputTokens: 3,
      outputTokens: 2,
      providerCostMicros: 10,
    });
  });

  it("settles accounting and creates one outbound delivery", async () => {
    const db = new FakeDb();
    const result = await processChannelInbound({ DB: db } as never, item);

    expect(result).toEqual({ ok: true, deliveryId: "delivery_message_1" });
    expect(mocks.reserveCredits).toHaveBeenCalledWith(
      expect.anything(), "tenant_1", "channel:message_1", "project_1", 100
    );
    expect(mocks.reserveUsage).toHaveBeenCalledOnce();
    expect(mocks.completeCreditReservation).toHaveBeenCalledWith(
      expect.anything(), "tenant_1", "channel:message_1", 40
    );
    expect(db.batches).toHaveLength(1);
    expect(db.bindings.some(({ sql, values }) =>
      sql.includes("INSERT OR IGNORE INTO channel_deliveries") &&
      values.some((value) => typeof value === "string" && value.includes('"external_conversation_id":"chat_1"'))
    )).toBe(true);
  });

  it("marks usage failed and refunds when the provider fails", async () => {
    const db = new FakeDb();
    mocks.callGemini.mockRejectedValueOnce(new Error("upstream body must not escape"));

    const result = await processChannelInbound({ DB: db } as never, item);

    expect(result).toEqual({ ok: false, code: "PROVIDER_ERROR" });
    expect(mocks.refundCreditReservation).toHaveBeenCalledWith(
      expect.anything(), "tenant_1", "channel:message_1"
    );
    expect(db.runs.some((sql) => sql.includes("UPDATE usage_events SET status = 'failed'"))).toBe(true);
  });

  it("does not invoke the provider for a completed replay", async () => {
    const db = new FakeDb();
    db.usage = { status: "completed" };

    const result = await processChannelInbound({ DB: db } as never, item);

    expect(result).toEqual({ ok: true, duplicate: true });
    expect(mocks.callGemini).not.toHaveBeenCalled();
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
  });

  it("refunds a reservation when persistence fails before settlement", async () => {
    const db = new FakeDb();
    db.batchError = new Error("D1 unavailable");

    const result = await processChannelInbound({ DB: db } as never, item);

    expect(result).toEqual({ ok: false, code: "PERSISTENCE_ERROR" });
    expect(mocks.refundCreditReservation).toHaveBeenCalledOnce();
    expect(mocks.completeCreditReservation).not.toHaveBeenCalled();
  });

  it("does not refund a persisted provider response when settlement fails", async () => {
    const db = new FakeDb();
    mocks.completeCreditReservation.mockRejectedValueOnce(new Error("settlement unavailable"));

    const result = await processChannelInbound({ DB: db } as never, item);

    expect(result).toEqual({ ok: false, code: "SETTLEMENT_ERROR" });
    expect(mocks.refundCreditReservation).not.toHaveBeenCalled();
    expect(db.runs.some((sql) => sql.includes("last_error_code = 'SETTLEMENT_ERROR'"))).toBe(true);
  });
});
