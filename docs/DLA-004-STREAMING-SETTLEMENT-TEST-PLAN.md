# DLA-004 — Streaming Usage/Credit Settlement Test Plan

**Status:** Phase 2 Complete (implementation) → Phase 3 Next (testing)  
**Date:** 2026-09-01  
**Priority:** P0 (blocking go-live)

---

## Implementation Summary

### What Was Changed
- **Added** token parsing utilities for OpenAI and Gemini SSE streams
- **Refactored** streaming request handler to accumulate tokens and settle with actual usage
- **Updated** credit settlement to use real token counts instead of estimated maximums
- **Files Modified:** `apps/api/src/index.ts` (added ~60 lines, refactored ~100 lines)

### Key Behavior Change
**Before:** Streaming requests used max output token estimate forever → tenant overcharged  
**After:** Streaming requests extract actual tokens from SSE → refund overage → accurate billing

---

## Phase 3 Test Plan

### 1. Unit Tests (Foundation)

#### 1.1 OpenAI Token Parsing
```typescript
// Test: parseOpenAIStreamEvent with token usage
const event = JSON.stringify({
  choices: [{ delta: { content: "hello" } }],
  usage: { prompt_tokens: 10, completion_tokens: 5 }
});
const result = parseOpenAIStreamEvent(event);
assert(result.inputTokens === 10);
assert(result.outputTokens === 5);

// Test: Missing usage field
const noUsage = JSON.stringify({ choices: [{ delta: {} }] });
const result2 = parseOpenAIStreamEvent(noUsage);
assert(result2.inputTokens === undefined);

// Test: Invalid JSON (should not throw)
const invalid = "not json";
const result3 = parseOpenAIStreamEvent(invalid);
assert(result3.inputTokens === undefined);
```

#### 1.2 Gemini Token Parsing
```typescript
// Test: parseGeminiStreamEvent with token usage
const event = JSON.stringify({
  candidates: [{ content: {} }],
  usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 8 }
});
const result = parseGeminiStreamEvent(event);
assert(result.inputTokens === 15);
assert(result.outputTokens === 8);

// Test: Missing usageMetadata
const noMetadata = JSON.stringify({ candidates: [] });
const result2 = parseGeminiStreamEvent(noMetadata);
assert(result2.inputTokens === undefined);
```

#### 1.3 Token Accumulation
```typescript
// Test: Accumulate multiple events, take final tokens
const buffer = [
  'data: {"usage":{"prompt_tokens":10,"completion_tokens":1}}',
  'data: {"usage":{"prompt_tokens":10,"completion_tokens":3}}',
  'data: {"usage":{"prompt_tokens":10,"completion_tokens":5}}',
];
const result = accumulateTokensFromStream("openai", buffer);
assert(result.inputTokens === 10);
assert(result.outputTokens === 5); // Last event wins
```

---

### 2. Integration Tests (API Level)

#### 2.1 Streaming Request → Settlement Flow
```
Test: POST /v1/responses with stream=true

Pre:
- Tenant has 1000 credits
- Plan configured with standard pricing

Steps:
1. Send streaming request (Idempotency-Key: test-001)
2. Mock provider returns 10 SSE events with final usage: input=100, output=50
3. Client consumes stream to completion
4. Verify response.completed event includes token counts

Post:
- Verify usage_events row created with:
  - status = 'completed'
  - input_tokens = 100
  - output_tokens = 50
  - customer_charge_micros = calculated(100, 50)
- Verify credit_reservations has:
  - status = 'completed'
  - actual_credits = customer_charge_micros
- Verify credit_ledger has consumption + refund entries
- Verify credit_accounts.subscription_balance updated (100 - refund)
```

#### 2.2 Streaming vs Non-Streaming Convergence
```
Test: Same provider/model/input, both streaming and non-streaming

Pre: Same tenant, same model, same input prompt

Steps:
1. Make non-streaming request (identical input)
   - Capture: input_tokens, output_tokens, customer_charge_micros
2. Make streaming request (identical input)
   - Capture: same fields

Post:
- Token counts should match (or be within 5% for sampling variation)
- Customer charge should match exactly
- Ledger entries should be identical
```

#### 2.3 Idempotency on Streaming Retry
```
Test: Retried streaming request with same Idempotency-Key

Pre:
- First request: stream=true, Idempotency-Key: retry-001

Steps:
1. Send request A with retry-001 → stream completes, settles 50 credits
2. Send request A again with retry-001 → stream re-attempts

Post:
- Second request should return 409 IDEMPOTENCY_KEY_REUSED (at reservation)
  OR
- Second request should find existing reservation and use it
- Either way: NO DOUBLE-CHARGING
- credit_accounts.balance unchanged after second request
```

---

### 3. Edge Cases (Error Handling)

#### 3.1 Partial Stream (Client Disconnects)
```
Test: Client closes connection mid-stream

Pre:
- Reserved 100 credits
- Provider sends 5 events out of 10
- Last event has: input=100, output=25 (partial)

Steps:
1. Client calls stream.cancel() after 5th event
2. ReadableStream.cancel() triggers refundCreditReservation()

Post:
- usage_events.status = 'failed'
- credit_reservations.status = 'refunded'
- Full 100 credits refunded to account
- Ledger shows full refund entry
```

#### 3.2 Provider Error Mid-Stream
```
Test: Provider returns HTTP error after partial stream

Pre:
- Reserved 100 credits
- Provider connection dies after 5 events

Steps:
1. Reader.read() throws network error
2. Stream.pull() catches error, calls refundCreditReservation()

Post:
- usage_events.status = 'failed'
- credit_reservations.status = 'refunded'
- Full 100 credits refunded
- Error logged with request_id for debugging
```

#### 3.3 Stream Timeout
```
Test: Stream stalls (no new data for 30s)

Pre:
- Provider connection established
- Data flowing initially, then stalls

Steps:
1. Client timeout triggers abort/cancel
2. ReadableStream.cancel() calls refundCreditReservation()

Post:
- Same as partial stream: full refund
- Reservation status = 'refunded'
```

#### 3.4 Zero/Empty Stream
```
Test: Provider sends empty response with token counts

Pre:
- Stream ends immediately with: input=0, output=0

Steps:
1. accumulateTokensFromStream() returns { input: 0, output: 0 }
2. managedCustomerChargeMicros(0, 0) returns minimum 1 credit
3. Settlement processes with 1 credit charge

Post:
- Minimum 1 credit charged (no free requests)
- Ledger entry recorded
```

---

### 4. Load & Concurrency Tests (Production Readiness)

#### 4.1 Concurrent Streaming Requests
```
Test: 10 simultaneous streaming requests from same tenant

Pre:
- Tenant has 10,000 credits
- Each request reserves ~100 credits
- Each provider call takes 2-3 seconds

Steps:
1. Send 10 requests with different Idempotency-Keys
2. All streams run in parallel
3. Each stream sends ~10 events
4. Provider returns actual token counts

Post:
- All 10 requests settle correctly
- credit_accounts.balance = 10000 - sum(actual_charges)
- Ledger has 20 entries (10 reservations + 10 settlements)
- No race conditions or duplicate charges
- No deadlocks on D1
```

#### 4.2 Interleaved Streaming/Non-Streaming Requests
```
Test: Mix of streaming and non-streaming requests

Pre:
- Tenant has 5,000 credits
- 5 streaming + 5 non-streaming requests

Steps:
1. Send alternating requests (S, NS, S, NS, ...)
2. All requests complete

Post:
- Final balance is correct (sum of all charges)
- Ledger entries match request order
- Both paths use same pricing logic
```

#### 4.3 Token Parser Memory Efficiency
```
Test: Large stream with 1000+ events

Pre:
- Mock provider sends 1000 small SSE events

Steps:
1. Send request with stream=true
2. Each event ~200 bytes, total ~200KB

Post:
- streamBuffer accumulates lines efficiently
- No memory leaks (buffer cleared on completion)
- Response completes within 5s
- All tokens parsed correctly
```

---

### 5. Regression Tests (Existing Functionality)

#### 5.1 Non-Streaming Requests Unchanged
```
Test: Non-streaming requests still work (stream=false)

Pre: Existing behavior should continue

Steps:
1. POST /v1/responses { stream: false, ... }
2. Verify no changes to settlement logic
3. Verify existing tests still pass

Post:
- Behavioral parity with pre-DLA-004
- Performance unchanged
```

#### 5.2 BYOK Requests Unaffected
```
Test: BYOK (tenant-provided keys) still work

Pre: BYOK uses flat fee, not token-based pricing

Steps:
1. Send streaming request with BYOK provider
2. Verify settlement uses byok_request_fee_micros
3. Verify tokens parsed but not used for charge calculation

Post:
- BYOK requests charged flat fee (not tokens)
- No behavioral change
```

#### 5.3 Failed Requests Refund Correctly
```
Test: Failed streaming requests refund reservation

Pre: Existing refund logic

Steps:
1. Send streaming request
2. Provider returns 400 Bad Request before first event

Post:
- refundCreditReservation() called
- Full reservation refunded
- Ledger shows refund entry
```

---

### 6. Data Validation & Integrity

#### 6.1 Ledger Reconciliation
```
Test: All credit flows are recorded

Post-execution query:
SELECT
  SUM(amount) as net_change,
  COUNT(*) as entry_count
FROM credit_ledger
WHERE tenant_id = ? AND reference_id = ?;

Verify:
- Reservation: -N (reserved)
- Consumption: -N (settled)
- Refund: +M (refunded, if M > 0)
- Net: -N + M (should equal settled amount)
```

#### 6.2 Token Count Consistency
```
Test: input + output = total_tokens

Verify across all usage_events:
SELECT COUNT(*) FROM usage_events
WHERE (input_tokens + output_tokens) != total_tokens
  AND total_tokens > 0;

Result should be 0.
```

#### 6.3 No Negative Balances
```
Test: Account balance never goes negative

Verify:
SELECT COUNT(*) FROM credit_accounts
WHERE subscription_balance < 0
  OR purchased_balance < 0
  OR promotional_balance < 0;

Result should be 0 (triggers prevent this).
```

---

### 7. Client-Visible Correctness

#### 7.1 Token Data in Response
```
Test: response.completed event includes token breakdown

Verify SSE event:
{
  "type": "response.completed",
  "request_id": "req_...",
  "tokens": {
    "input": 100,
    "output": 50
  }
}

Client can use this for transparency/analytics.
```

#### 7.2 Consistent Pricing Display
```
Test: Displayed charge matches ledger

Client receives: "100 input tokens @ $0.50/1M = 0.00005 credits"
Ledger shows: customer_charge_micros = 50 (micros)

Verify conversion: 0.00005 credits = 50 micros ✓
```

---

### 8. Deployment Checklist

Before going live with DLA-004:

- [ ] All unit tests pass (token parsing, accumulation)
- [ ] All integration tests pass (streaming → settlement flow)
- [ ] All edge case tests pass (errors, cancellation, timeout)
- [ ] Load tests pass (10+ concurrent, 1000+ events)
- [ ] Regression tests pass (non-streaming, BYOK, failures)
- [ ] Ledger reconciliation queries return expected results
- [ ] Token count consistency verified across 1000+ rows
- [ ] No negative balance violations
- [ ] UAT environment verified with sandbox providers
- [ ] Monitoring in place:
  - Streaming completion rate (% success)
  - Token extraction success rate
  - Settlement latency (P50, P95, P99)
  - Ledger reconciliation alerts
- [ ] Rollback plan documented
- [ ] Team trained on DLA-004 behavior and troubleshooting

---

## Success Criteria

✅ **Streaming and non-streaming converge on identical charges**  
✅ **No tenant overcharged (estimates replaced with actuals)**  
✅ **All refunds issued atomically within D1 transaction**  
✅ **Zero orphaned reservations (settled + ledger consistency)**  
✅ **Idempotency works for all edge cases**  
✅ **Token parsing handles provider variations**  
✅ **Load test passes without deadlocks**  
✅ **Monitoring shows streaming settlement accuracy > 99.9%**

---

## Timeline

| Phase | Task | Est. Effort | Owner |
|-------|------|------------|-------|
| 3a | Unit tests | 2 days | Dev |
| 3b | Integration tests | 3 days | QA |
| 3c | Edge cases + load | 2 days | QA + Ops |
| 3d | UAT deployment | 1 day | DevOps |
| 3e | Monitoring + rollback plan | 1 day | Ops |
| **Total** | | **9 days** | Team |

**Go-live target:** Mid-September (pending test completion)

---

## Rollback Plan

If DLA-004 causes issues in production:

1. **Immediate:** Set feature flag `STREAMING_SETTLEMENT_DISABLED=true`
2. **Behavior:** Revert streaming to old path (estimate-based, full refund on completion)
3. **Duration:** Until root cause identified and hotfixed
4. **Communication:** Notify customers of temporary estimate billing

Once stable, re-enable feature flag.

---

## Monitoring & Alerts

```sql
-- Alert if streaming completion rate drops below 95%
SELECT
  COUNT(*) as total_streaming,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
FROM usage_events
WHERE created_at > datetime('now', '-1 hour')
  AND provider IN ('openai', 'google');

-- Alert if any reservations orphaned (reserved but never settled)
SELECT COUNT(*) FROM credit_reservations
WHERE status = 'reserved'
  AND created_at < datetime('now', '-10 minutes');

-- Alert if ledger imbalance detected
SELECT tenant_id, SUM(amount) as net_change
FROM credit_ledger
GROUP BY tenant_id
HAVING net_change < 0;
```

---

## QA Handoff

**Ready for testing:**
- Implementation complete, zero compilation errors
- Token parsing utilities in place
- Streaming handler refactored
- No schema changes required
- Backward compatible

**Test environment:**
- Local: `wrangler dev` with sqlite D1
- Sandbox: Stripe test mode + OpenAI/Gemini sandbox
- UAT: Full staging environment

**Success metrics:**
- See "Success Criteria" section above
