# dLogicAI — NEXT WORK

> Daily execution pointer. Specifications define what the system should do; this file defines what should be worked on now.

## Current Sprint
**HYBRID LAUNCH: MVP (Sept 1-6) + Streaming Phase 2 (Sept 7-20) — P0**

**Launch Strategy:** Ship non-streaming MVP on Sept 6, add streaming (DLA-004) in Phase 2
**Rationale:** De-risk launch by shipping proven non-streaming billing; test streaming separately
**See:** `docs/LAUNCH-SPRINT-HYBRID.md` for full 6-day sprint plan

## TODAY (Sept 1 — Sprint Day 1: Verification) — ✅ DONE

**Result:** All 3 features verified against the real local API (`wrangler dev`), real Stripe
test API, and real Resend API — not code review, actual requests.

#### ✅ Action 1: Verify 2FA Enforcement — DONE
- Verified end-to-end: register → enroll TOTP → login rejected `401 TWO_FACTOR_REQUIRED` with
  challenge → correct code → session created.

#### ✅ Action 2: Verify Stripe Checkout — DONE
- Verified live against Stripe test API: real `cs_test_...` session + `checkout_url` returned.
- `allowedAppUrl()` requires success/cancel URL path `/dashboard/billing` — confirmed as intended
  contract, not a bug (matches what `apps/web/src/pages/dashboard/billing.astro` actually sends).

#### ✅ Action 3: Verify Invite Email — DONE (with a real fix)
- Found real blocker: `EMAIL_FROM` pointed at an unverified sender domain, and Resend also
  rejects sending to unverified recipient domains (e.g. `example.com`) regardless of sender.
- Fixed for local dev: switched `.dev.vars` `EMAIL_FROM` to Resend's sandbox sender
  `onboarding@resend.dev`; tested against Resend's reserved recipient `delivered@resend.dev`.
  Verification email and invite email both send successfully now (no `EMAIL_DELIVERY_FAILED`).
- **Still open for production** (deferred per decision — domain verification done later):
  production `EMAIL_FROM` needs a verified domain in the Resend dashboard before real user
  emails will deliver. Config/account task, not a code fix. Track in Day 2-4 production prep.

#### Bonus: Test suite health check
- `npx vitest run` found 2 pre-existing failures in `tests/credit-integration.test.ts` — both
  were broken hardcoded arithmetic in the test fixtures themselves (unrelated to production
  code, no imports from `src/index.ts`). Fixed. **45/45 tests pass.**

#### 📋 Configuration Decisions (remaining — business/account, not engineering)
- [x] **Stripe Mode:** Sandbox — decided. `.dev.vars` `STRIPE_SECRET_KEY` is `sk_test_...`, confirmed via the real `cs_test_...` Checkout session created during verification. Launch on test mode; switch to live keys only after a deliberate go-live decision post-Sept 6.
- [ ] **Email Sender:** Verify a real domain in Resend (noreply@dlogicai.com or hello@) — currently on sandbox sender. **Deferred, to be verified before production go-live (Day 4-5 gate, not Day 1).**
- [ ] **Production Domain:** Needed for CORS + email configuration. **Deferred, to be verified before production go-live (Day 4-5 gate, not Day 1).**

**Pre-launch gate (Day 5, before Day 6 go-live):** Both items above must be confirmed done —
Resend domain verified and production domain finalized — or Day 6 launch slips. These are the
only two items standing between "verified locally" and "ready for production."

**End of Day 1:** All features verified working. Only remaining items are account/business
decisions (Stripe mode, domain verification), not code blockers. Ready for Day 2 deployment.

**See:** `docs/LAUNCH-DAY-1-ACTIONS.md` for detailed test procedures

**Parallel (DLA-004 Testing):**
- [x] Phase 3a token-parser unit tests completed locally on Sept 1.
- OpenAI Responses API, nested completion, Chat Completions compatibility, Gemini,
  malformed events, zero-token values, final-event accumulation, and `[DONE]` handling covered.
- MVP environments now default `STREAMING_ENABLED=false`; `stream: true` is rejected unless
  an environment explicitly enables the Phase 2 runtime.
- Local verification: API tests 53/53, API TypeScript build, Astro check, Astro production
  build, and local D1 migration application all pass.
- Next: Phase 3b streaming settlement integration tests on Day 2.

## LAUNCH SPRINT SCHEDULE

See `docs/LAUNCH-SPRINT-HYBRID.md`:
- **Day 1 (Sept 1):** 2FA + Stripe + Email prep
- **Day 2 (Sept 2):** Implementation + staging deploy
- **Day 3 (Sept 3):** UAT + regression testing
- **Day 4 (Sept 4):** Production prep (migrations, secrets, monitoring)
- **Day 5 (Sept 5):** Final validation + smoke tests
- **Day 6 (Sept 6):** 🚀 LAUNCH to production

### Parallel: DLA-004 — Streaming Usage/Credit Settlement
**Status:** IMPLEMENTATION COMPLETE, PHASE 2 (Sept 7-20)
**Priority:** P0 (deferred post-launch)

**Specifications**
- `docs/13_AI_CREDITS_SPEC.md`
- `docs/11_USAGE_QUOTA_SPEC.md`
- `docs/DLA-004-STREAMING-SETTLEMENT-TEST-PLAN.md` (NEW)

**Completion Summary (2026-09-01)**
- ✅ Added token parsing utilities for OpenAI and Gemini SSE streams
- ✅ Refactored streaming handler to accumulate tokens from provider events
- ✅ Updated settlement to use actual token counts (not estimates)
- ✅ Streaming and non-streaming paths now converge on identical charges
- ✅ Refund logic handles partial streams and provider errors

**Acceptance Criteria**
- [x] Token parsing works for OpenAI SSE format (prompt_tokens, completion_tokens)
- [x] Token parsing works for Gemini SSE format (promptTokenCount, candidatesTokenCount)
- [x] Streaming settlement calculates charge from actual tokens
- [x] Refund issued for overage between estimate and actual
- [x] Idempotent for retried requests (no double-charging)
- [x] Unit tests for token parsing scenarios
- [ ] Integration tests: streaming request → settlement → ledger verification
- [ ] Edge case tests: partial stream, provider error, timeout, empty stream
- [ ] Load tests: 10+ concurrent streaming requests
- [ ] Regression tests: non-streaming, BYOK, failures still work
- [ ] UAT verification with sandbox providers
- [ ] Live D1 regression tests for streaming token extraction and settlement

### Testing Strategy
See `docs/DLA-004-STREAMING-SETTLEMENT-TEST-PLAN.md` for:
- 8 phases of testing (unit, integration, edge cases, load, regression, validation, deployment)
- Test code examples for each scenario
- Success criteria and deployment checklist
- Monitoring and rollback plan

**Next Steps**
1. Phase 3a: Write and execute unit tests for token parsing
2. Phase 3b: Integration tests for streaming request → settlement flow
3. Phase 3c: Edge cases and load testing
4. Phase 3d: UAT deployment and monitoring setup
5. Phase 3e: Go-live readiness verification

## NEXT (After DLA-004 Testing Complete)

1. DLA-002 — Credit Reservation Rollback (unblock: need live D1 regression tests for this too)
2. DLA-003 — Credit Ledger Settlement (can parallelize with DLA-004 testing)
3. DLA-005 — Billing API Integration
4. DLA-006 — Configurable Pricing
5. DLA-007 — Organization Active-Tenant and Role Authorization
6. DLA-008 — Complete Conversation Takeover and Tenant Invitations

## CHANNEL INTEGRATION — INCREMENTAL ROLLOUT

**Accelerated decision (Sept 1):** deliver a text-only Telegram, WhatsApp, and Web Chat MVP by
**Thursday, Sept 3**. This temporarily promotes the shared channel runtime to P0 alongside launch
verification. The target is feature-complete in local/UAT; production enablement still requires
provider credentials, approved domains, webhook registration, and the normal launch gate.

### Definition of done for Sept 3
- Telegram: verified inbound webhook → queued AI response → outbound text delivery.
- WhatsApp: verified signed inbound webhook → queued AI response → outbound text delivery.
- Web Chat: public-safe widget token, allowed-origin enforcement, anonymous conversation session,
  non-streaming AI response, and embeddable text-only widget.
- All three reuse one tenant/project/Chat Service-scoped runtime, conversation history, managed/BYOK
  provider routing, usage reservation, credit reservation/settlement/refund, and delivery records.
- Replayed webhook/widget requests are idempotent; secrets and raw provider errors are never exposed.
- Automated adapter/runtime/security tests pass, followed by UAT smoke tests for all three channels.

### Wednesday, Sept 2 — Shared runtime + Telegram/WhatsApp complete
- [ ] Implement the inbound queue consumer as a shared `processChannelInbound()` service.
- [ ] Load bounded conversation history and invoke the existing non-streaming response/accounting path.
- [ ] Persist the assistant message and create/send an idempotent outbound delivery.
- [ ] Make Telegram and WhatsApp use the same runtime; preserve signature verification and tenant scope.
- [ ] Add retry exhaustion state and structured operational logging.
- [ ] Add unit/integration tests for webhook replay, provider failure/refund, history, and outbound retry.
- [ ] Local smoke test Telegram and WhatsApp with sandbox/test credentials.

### Thursday, Sept 3 — Web Chat + cross-channel UAT complete
- [ ] Add `web` to the channel model and create a public-safe, service-scoped widget token.
- [ ] Add per-installation allowed origins and enforce them on widget bootstrap/message endpoints.
- [ ] Add an anonymous visitor session mapped to `channel_conversations` without exposing API keys.
- [ ] Implement the basic floating/inline text widget using the shared non-streaming runtime.
- [ ] Add bounded per-token/session rate limiting and input/output HTML safety tests.
- [ ] Run cross-tenant, CORS, replay, accounting, and three-channel end-to-end tests.
- [ ] Deploy to UAT and complete Telegram, WhatsApp, and Web Chat smoke verification.
- [ ] Keep `channels_enabled` restricted to internal/beta tenants until the production launch gate passes.

### Explicitly deferred beyond Sept 3
- Knowledge-base and dialog-flow orchestration in channel responses.
- Media, interactive Telegram messages, and approved WhatsApp templates.
- Advanced widget branding beyond greeting, accent color, and placement.
- Production-scale load tuning and GA rollout to every paid tenant.

The staged dates below are superseded by this accelerated plan but retained as the post-MVP
hardening and feature backlog.

### Stage 0 — Shipped
- [x] Shared Telegram/WhatsApp adapter contract and inbound normalization
- [x] Tenant-scoped channel installations and webhook verification
- [x] Inbound channel conversation mapping
- [x] Telegram outbound text delivery
- [x] WhatsApp outbound text delivery
- [x] Channel delivery records with bounded retry state
- [x] Channel installation dashboard UI

### Stage 1 — Telegram Beta (target: Sept 8-10, ~14-18h)
Feature-flagged to internal/beta tenants only. Text-only, Telegram only.
- [ ] Queue consumer (`CHANNEL_QUEUE`) for inbound `channel.inbound` messages so the webhook handler stays fast and ack's immediately
- [ ] Non-streaming AI response generation wired from inbound message → existing credit/provider runtime → `sendChannelDelivery()`
- [ ] Conversation history retrieval so multi-turn channel threads get prior turns as context
- [ ] No KB, no dialog flow wiring yet — plain chat-service response only

### Stage 2 — Knowledge Base + Dialog Flow + WhatsApp (target: Sept 11-14, ~16-20h)
- [ ] Wire `retrieveKnowledgeContext()` into the channel response path
- [ ] Wire dialog flow state completion (`persistDialogRuntime`) to `sendChannelDelivery()` for outbound prompts/outcomes
- [ ] Expand Stage 1 to WhatsApp (text-only)
- [ ] Basic delivery-failure alerting (stuck queue, repeated retry exhaustion)

### Stage 3 — Production Hardening (target: Sept 15-18, ~18-22h)
- [ ] Unit tests: adapter parsing (Telegram + WhatsApp payload shapes, signature verification)
- [ ] Integration tests: webhook → conversation → AI response → delivery, idempotency on replayed webhooks
- [ ] Queue-backed retry/rate-limit scheduling tuned for production traffic
- [ ] Remove feature flag restriction — open to all tenants on paid plans

### Stage 4 — Media & Templates (target: Sept 21+, Phase 3, ~12-16h)
- [ ] Telegram media and interactive message support
- [ ] WhatsApp media and approved template support

### Stage 1b — Web Chat Widget, parallel track (target: Sept 11-15, ~26-35h)
Marketing page (`dashboard/channels.astro`) already lists "Web Chat" as Available, but that's only
the authenticated dashboard test preview (`/v1/responses` with a full `sk_` API key). No public,
embeddable widget exists yet, and `Channel` type is currently `"telegram" | "whatsapp"` only —
`"web"` needs to be added. Reuses the Stage 1 AI-response wiring, so it starts once Stage 1 lands.
- [ ] Add `"web"` to the `Channel` union and a widget-scoped key type (public-safe, tied to one `chat_service_id`, no tenant secrets exposed) — 3-4h
- [ ] Per-installation domain allowlist (tenant configures which origins — intranet or public internet — may embed the widget) — 2-3h
- [ ] Embeddable JS snippet (floating bubble or inline), anonymous visitor session via cookie/localStorage mapped to `channel_conversations` — 8-10h
- [ ] Rate limiting / abuse protection on the public, unauthenticated widget endpoint — 3-4h
- [ ] Basic branding options (greeting, color, logo) — 3-4h
- [ ] Testing: CORS enforcement, XSS/script-injection safety, rate-limit behavior — 4-6h
- Folds into Stage 3 hardening before GA (~Sept 18-20)

### Constraints
- Preserve tenant isolation.
- Preserve Cloudflare Workers/D1 compatibility.
- Follow `docs/13_AI_CREDITS_SPEC.md`.
- Each stage ships behind `channels_enabled` flag; no stage blocks the Sept 6 MVP launch.

## KNOWLEDGE COST CONTROLS

- [x] Enforce plan-scoped KB, document, R2 storage, chunk, attachment, upload-size, and retrieval-context limits.
- [x] Reject duplicate documents by tenant checksum before R2 storage.
- [x] Allow owner/admin post-index source deletion while retaining chunks and metadata.
- [ ] Monthly ingestion/reprocessing budgets, intentionally deferred.

## TOMORROW (Contingent on DLA-004 Testing)

### DLA-003 — Credit Ledger Settlement
**Status:** QUEUED
**Priority:** P0
- Implement advanced ledger settlement logic
- Extend usage_events schema for token-level tracking (if needed post-DLA-004 validation)
- Can begin in parallel with DLA-004 testing

### DLA-008 — Complete Conversation Takeover and Tenant Invitations
**Status:** QUEUED
**Priority:** P1
- Apply `apps/api/migrations/0011_conversation_takeover_and_invitations.sql` before deployment.
- Automate new-user invitation email delivery.
- Add invitation acceptance and account onboarding.
- Verify tenant-user roles and direct conversation takeover behavior end to end.

## HOLD
- Advanced Chat Services runtime features beyond the accelerated text-only channel MVP
- Conversation Intelligence runtime (awaiting streaming/credit foundation)
- Connector runtime (awaiting streaming/credit/billing foundation)
- Advanced analytics (observability foundation required)

## After Completing TODAY
1. Add and run accounting/concurrency tests against D1.
2. Update `PROJECT_STATE.md` and `docs/21_SPEC_COMPLIANCE_MATRIX.md` with the verification result.
3. Mark DLA-001 complete.
4. Move DLA-002 into `TODAY`.
5. Record tests/checks performed.
6. Record any required migration or ADR.

## Daily Rule
When asked **"What should I work on today?"**, select the highest-priority `READY` task unless the user explicitly overrides it.
