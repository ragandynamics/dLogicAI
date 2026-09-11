# dLogicFlow — NEXT WORK

## Interactive Forms — latest user priority, 2026-09-11

- [x] Implement the local form creation, test, publication, activation, customer submission and tenant review journey; see docs/29_INTERACTIVE_FORMS.md.
- [x] Verify 170 passing API tests (two remote opt-in skipped), API type check, full dashboard build and ordinary dashboard check (zero errors/warnings, seven hints). This resolves the earlier stalled dashboard check below.
- [ ] Complete manual browser acceptance: create a draft, generate a test link, validate required/conditional fields, review and submit, publish/activate, submit as a customer, inspect the submission, and deactivate.
- [ ] Before any authorized release, review pending migrations through 034, enable Forms explicitly, confirm scheduled retention cleanup and verify deployed authentication, links and connector approval. No remote changes authorized or performed.


## Feature availability — latest user priority, 2026-09-11

- [ ] Complete the stalled dashboard check and fresh browser interaction checks for staff availability and tenant access before release.

- [x] Verify 161 passing API regressions (two remote tests skipped), API/staff type checks and staff browser-script parsing.

- [x] Add audited system-admin availability and tenant restrictions, operations visibility and tenant availability reporting.
- [x] Enforce existing experience/channel/action controls and register planned features without permitting premature activation.
- [ ] Authorize and verify a coordinated API/staff release with migration 032 prerequisites; nothing deployed. See docs/28_FEATURE_AVAILABILITY.md.
- [ ] Future refinements: plan-product mapping, affected-service counts and availability-aware creation controls throughout the tenant UI.


## HubSpot connectors — latest user priority, 2026-09-10

- [x] Implement native HubSpot contacts/tickets plus shared connector runtime, encrypted credentials, scoped incoming data and response grounding.
- [x] Add setup/test/activation, service bindings, sync, reviewed outgoing actions, flow proposals, usage settlement and audit history.
- [x] Validate 156 passing API tests (two remote opt-in tests skipped), API type check, Worker dry build, dashboard check/build and sample-data browser journeys.
- [ ] For an authorized release, follow docs/27_BUSINESS_CONNECTORS_RUNBOOK.md: review pending migrations through 033, configure connector entitlement/pricing, Queue/Cron, HubSpot credentials and customer-identity integration; verify designated live reads/writes and billing reconciliation.
- Changes remain local. Native OAuth/webhooks, broader CRM/marketplace adapters and a visual flow-action mapping editor remain future scope. Earlier verification and release tasks below remain open.

## Staff portals — latest user priority, 2026-09-10

- [x] Create separate system-admin, operations and billing Worker apps with shared, role-restricted APIs/UI.
- [x] Add tenant usage/billing dashboards, payment/invoice/credit views, problem/contact queues, team assignment, status and internal updates.
- [x] Add audit/system diagnostics and editable channel guardrails with runtime enforcement.
- [x] Validate: 135 passing API tests (2 opt-in skipped), API/staff type checks, three Worker dry builds and sample-data browser workflow checks.
- [ ] For an authorized release: configure environment D1/R2 bindings and three Access applications/audiences, review/apply migration 032 after earlier pending channel migrations, grant approved staff identities, deploy and run live smoke checks. See docs/26_STAFF_PORTALS_RUNBOOK.md.
- Current implementation remains local. Earlier email/Stripe webhook, channel release and UAT verification items below remain open.


## Widget templates - 2026-09-10

- [x] Add per-widget conversation templates, custom guidance and default reply-format choices; preserve service-flow defaults for older widgets.
- [x] Verify 120 local API tests, API type check, web build and sample-data browser preview.
- [ ] Verify live model adherence to selected templates in UAT after an authorized channel release. Changes remain local.


## Tenant journeys — latest user priority, 2026-09-10

- [x] Refine channel setup/activation guidance, list saved tenant connections, resume the selected widget, and add reversible social-channel deactivation.
- [x] Add filtered usage tracking, latest-signal conversation analytics, role-restricted audit history and shared tenant navigation.
- [x] Audit channel mutations atomically and preserve conversation reply drafts during refresh/failure.
- [x] Verify locally: API type check, 118 passing tests (2 opt-in skipped), Astro check (0 errors/warnings, 5 existing hints), full dashboard build and sample-data browser journeys.
- [ ] After a separately authorized channel release, verify the journeys against live UAT channel delivery and accounting. Pending channel bundle and migrations 027–031 remain local.
- [ ] Complete broader governance audit coverage (safe before/after snapshots, controlled/audited exports and retention) in its own scoped follow-up.
- Earlier verification items below remain open; this request did not authorize email sends or Stripe webhook changes.


## TODAY (2026-09-10 — latest verification pointer)

- [x] Verify credit-service concurrency against UAT D1: contention, duplicate settlement/refunds, zero/exact charges, atomic rollback and ledger reconciliation. Disposable fixtures cleaned up; full Worker HTTP load/streaming tests remain separate.
- [x] Add five real-SQL email-verification regressions and four signed Stripe lifecycle regressions; fix Stripe item-level billing periods. API build and 111 local tests pass; two remote tests are opt-in. Astro check: 0 errors/warnings, 5 hints.
- [x] Honor user release scope: keep channel bundle local; deploy isolated UAT billing/Gemini fixes and safe upstream-status diagnostic only. Preserve bindings, disabled streaming and production. Apply no migrations.
- [ ] Complete managed-AI repeatability check: two successful UAT calls (the first reconciled 23 input / 1 output tokens and 5 credit units), with one intervening 502. Final smoke and cleanup pass; safe upstream-status diagnostic is deployed. The intermittent failure remains unexplained.
- [ ] Obtain approval to send a fresh verification email to the designated Yahoo account, then confirm inbox receipt and user verification. All existing UAT verification tokens are expired or used/replaced.
- [ ] Obtain explicit approval for the persistent Stripe test-mode UAT webhook and UAT signing-secret change, rejected by automatic approval review. Configure it and verify live updates, cancellation and retries using isolated test records. No endpoint created yet.
- [ ] Complete signed-in invitation/account-switch and multi-workspace/Developer journeys with the appropriate account/link; current owner session has only one workspace.
- Pending channel bundle and migrations 027–031 stay local per user instruction. No production release is authorized.

This section supersedes the older dated TODAY pointer and stale invitation-delivery blockers below. See the 2026-09-10 verification entry in PROJECT_STATE.md for evidence and limits.

## Next session — user agreed 2026-09-09

Resume in approximately eight hours when the user returns. Priority order:

- [ ] Finish email verification: investigate the reported invalid/expired token without exposing or consuming the user's link; confirm a fresh link verifies successfully.
- [ ] Verify workspace access: invitation acceptance in an existing signed-in session, explicit account switching, multi-workspace switching, and Developer permissions/tenant isolation.
- [ ] Diagnose managed AI provider failures and verify successful UAT responses with correct credit charges.
- [ ] Verify credit safety against UAT D1: concurrent requests, duplicate settlement, and failure refunds; reconcile balances and ledger entries.
- [ ] Complete Stripe test-mode lifecycle checks: subscription updates, cancellation, and webhook retries without duplicate effects.
- [ ] Reconcile stale task/state/compliance entries. Invitation receipt and private-window acceptance are user-confirmed; the older non-delivery checklist entries below are historical, not current blockers.

Start with email verification, then prioritize AI responses and credit safety. Keep streaming disabled and production unchanged. This is a saved continuation plan, not authorization for a production release.

## Current user override — branding and invitations

- [x] Email verification 404 fixed: generated links use `/api/v1/auth/email/verify`, proxy preserves query parameters, and old `/v1/auth/email/verify` links redirect without consuming tokens. 76 tests pass; API/web checks/builds pass. UAT API `dac8dbdd-42ad-4a9e-824f-15cc5d8b3fba`, web `4a2dfa2e-a928-477c-b813-a51201e7291a`. Dummy-token smoke verified redirect and API error instead of 404; real-token verification left to user.

- [x] Invitation account-mismatch UX: dedicated mismatch/accepted error codes, explicit Switch account action preserving the token through login, and distinct expired/invalid messages. API build and 74 tests pass; web check/build pass. UAT API `037c94b5-9cb2-4a67-bee0-6642f4b192eb`, web `15d66e7f-06a4-414f-bf3a-e06d3e3b95c6` deployed. Full live account-switch journey remains to verify with an invitation link.
- User confirmed invitation receipt and acceptance in a private window after UAT sender changed to support@dlogicflow.com; earlier non-delivery reports are historical.

- [x] 2026-09-09: Fix exact-reservation settlement ledger, add three SQL regression cases, verify 71/71 API tests and deploy UAT API `22427676-6c3e-4312-b4a5-38e7ba475659`.
- [x] Correct misleading zero credit displays; web check/build pass and UAT web `df3f8723-a182-4942-804a-b3aa60939fcf` deployed. Credit account remains unchanged.
- [ ] Invitation email still not received; inspect sender delivery logs and make background send outcomes observable. Do not infer delivery from invitation creation.

- Updated shared tagline to “Customer Engagement Platform” and realigned dashboard/header/footer branding.
- [x] Tagline release deployed to existing UAT web Worker, version `dc019ea7-28f5-4863-98d2-f6abe1156b84`. Web check/build passed (0 errors, 0 warnings, 5 hints); live browser text and screenshot confirm tagline and logo alignment.

- Rename visible branding and internal packages to dLogicFlow; preserve all infrastructure names and URLs.
- Correct Team invitation form semantics, accessible status, duplicate-submit prevention and network-error feedback.
- [x] Verify and deploy to existing UAT Workers: API `c0bcd247-7f0c-4b89-9d98-50b092342613`, web `6d40a6bb-0e5b-4e3e-8dad-9204e4b83a1d`; 68 API tests and builds/checks pass.
- [x] Browser confirms dLogicFlow branding, real invitation form and successful invitation creation for the approved Developer recipient.
- [ ] Confirm email receipt and invitation acceptance; creation does not establish delivery.

> Daily execution pointer. Specifications define what the system should do; this file defines what should be worked on now.

## Current Sprint
**HYBRID LAUNCH: MVP (Sept 1-6) + Streaming Phase 2 (Sept 7-20) — P0**

**Launch Strategy:** Ship non-streaming MVP on Sept 6, add streaming (DLA-004) in Phase 2
**Rationale:** De-risk launch by shipping proven non-streaming billing; test streaming separately
**See:** `docs/LAUNCH-SPRINT-HYBRID.md` for full 6-day sprint plan

## TODAY (2026-09-08 — verification and UAT release gates)

- [x] Fix API compilation: import the two parsers used by the streaming route.
- [x] Add ten route/SQLite tests using actual usage/credit services and relevant migrations: actual-token settlement and ledger reconciliation, non-stream parity, partial failure/refund, cancellation, replay, final-line handling, split chunks, missing usage, rejected upstream cancellation, and disabled-stream gate.
- [x] Fix replay handling (409 before quota/provider work), final usage-line parsing, missing-usage refund, safe stream errors, cancellation cleanup, and BYOK flat-fee parity.
- [x] Verify API build and 68/68 tests; Astro check (0 errors, 0 warnings, 5 hints) and build.
- [x] Read remote UAT migration status: only `026_tenant_profile.sql` is pending.
- [x] Restore `gpt-5-mini` / `gemini-2.5-flash-lite` and previous pricing entries per user confirmation; repeat API build and 68/68 tests successfully.
- [x] Apply migration 026 and deploy API `e5a8f46c-44c3-4abf-ac34-1b99c679d3e0` and web `61945e40-d038-43c5-a4dd-c25b0dc22a83` to UAT. Web deployment succeeded on retry after a Cloudflare 503. API `/health` and web `/api/health` both return `ok:true`. Production untouched.
- [ ] Diagnose managed-provider failures and verify successful UAT calls/accounting; historical 502 evidence does not identify the underlying cause.
- [ ] Complete invited-new/existing-user and multi-workspace journeys. User designated a Yahoo test account; login page prepared in the in-app browser, awaiting user sign-in. No authenticated session was available; do not bypass verification or reset credentials.
- [ ] Complete D1/workerd settlement/concurrency tests, provider terminal/error-event handling, exact-reservation consumption-ledger coverage, timeout and load tests. Keep streaming disabled.

The dated sections below are historical records/backlog, not proof of current deployment or production readiness. The September 6 launch was a target, not a verified release.

## HISTORICAL (Sept 2 — Sprint Day 2: UAT Deployment and Verification)

### Completed
- [x] Confirmed the UAT D1 database has no pending migrations.
- [x] Added explicit UAT CORS/application origins for the deployed web Worker and local Astro testing.
- [x] Created and bound the dedicated `dlogicai-channel-work-uat` queue.
- [x] Deployed API version `88ff48c4-a740-4caf-bee6-4134332c31d4` and web version `60f373e2-e41e-435d-89ba-1a43a46314ee` to UAT.
- [x] Verified API health, web health, the web-to-API proxy, CORS allow/reject behavior, unauthenticated session rejection, and invalid API-key rejection.
- [x] API tests pass 58/58, API TypeScript builds, Astro check reports zero errors, and Astro production build passes.
- [x] Added generated-config preparation so CI retains the requested Astro environment and API service binding.
- [x] Implemented and deployed the shared Telegram/WhatsApp inbound processor: bounded history, non-streaming provider invocation, credit/usage settlement, idempotent outbound delivery creation, replay protection, and explicit provider/persistence/settlement failure paths.
- [x] Reconciled UAT D1 status tables after deployment; no stuck credit reservations, usage events, channel events, or deliveries were present.
- [x] Fixed the UAT `/register` blank page caused by request context being referenced from a slotted inline-script expression; deployed web version `78375ad7-3f76-4aec-9dd2-e7c0e3c60e56` and verified the rendered registration form.

### Remaining / blocked
- [ ] Complete the browser/email-dependent UAT cases: email verification, TOTP enrollment/challenge, invitation acceptance, Stripe-hosted Checkout/webhooks, tenant switching, and authenticated dashboard verification. A designated UAT inbox or usable signed-in browser session is required.
- [ ] Repair managed-provider UAT configuration. OpenAI and Gemini secret names are present, but explicit OpenAI (`gpt-5-mini`) and default Gemini (`gemini-2.5-flash-lite`) non-streaming smoke requests both returned HTTP 502 with normalized `PROVIDER_ERROR` on 2026-09-04. The failure paths reconciled correctly: each 626-micro reservation was refunded and its usage event was marked failed. Validate/rotate the UAT provider keys and confirm account/model access, then rerun both requests.
- [x] API-driven UAT checks passed for registration state, explicit session tenant binding, login/logout, project/API-key creation, unauthenticated billing protection, invalid Stripe signature rejection, catalog consistency, billing upgrade guard, and rejected redirect URLs. API tests remain 58/58; API build, Astro check (zero errors), and Astro production build pass.
- [ ] Register Telegram and WhatsApp provider webhooks after installation IDs and verification secrets are available.

## COMPLETED (Sept 1 — Sprint Day 1: Verification) — ✅ DONE

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
**Status:** PARTIAL IMPLEMENTATION, PHASE 2; disabled pending release gates above
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
3. Mark only tasks whose acceptance criteria have been verified complete.
4. Select the next blocking P0 task; do not automatically advance historical DLA pointers.
5. Record tests/checks performed.
6. Record any required migration or ADR.

## Daily Rule
When asked **"What should I work on today?"**, select the highest-priority `READY` task unless the user explicitly overrides it.

## Completed 2026-09-02 — MVP UX simplification

- [x] Replace the landing page with concise, outcome-led product content and prominent signup CTAs.
- [x] Reorder and reduce the post-login menu into Build, Operate, and Account groups.
- [x] Rename Service Requests to Report a problem and add secure screenshot attachment support.
- [x] Remove multi-environment controls from the primary MVP shell.
- [x] Create messaging channels in testing mode and require explicit activation before customer traffic is accepted.
- [x] Apply the screenshot migration and deploy/verify the web and API UAT workers.

## Completed locally 2026-09-04 — tenant user journey MVP slice

- [x] Add named workspace selection at login and membership-validated switching from the application shell.
- [x] Add the invitation landing page and preserve its token through registration or login before acceptance.
- [x] Expand tenant roles to admin, developer, billing, and sales operations while retaining owner as the super-admin mapping.
- [x] Restrict subscription mutations to the super admin and expose the new invite roles in Team.
- [x] Implement tenant profile read/update APIs and connect the Settings page with role-aware editing.
- [x] Add and locally apply migration `026_tenant_profile.sql`.
- [x] Verify 58/58 API tests, API TypeScript build, and Astro check with zero errors.
- [ ] Deploy migration/API/web to UAT and execute the invited-new-user, invited-existing-user, role-permission, and multi-workspace switching journeys end to end.

## Current user override — tenant channel creation journey (2026-09-09)

- Implement unified tenant setup for Web Chat, Telegram and WhatsApp, preserving project/service context and testing/activation separation.
- Verify new credential-validation, role and WhatsApp verification regressions plus API/web builds.
- Remaining: safe public Web Chat widget/session authentication and domain enforcement; provider registration/credential verification; authenticated browser journey and live Telegram/WhatsApp replies. Do not treat saved settings or activation as proof of connectivity.
- Verified: 82/82 API tests and API build pass; both changed browser scripts parse. Astro check stalled and was interrupted; finish web build and browser verification before release.
- Web check and standalone web build stalled without diagnostics; rerun both and perform browser verification before deploying channel journey changes.

## Current user override — Web Chat embed and Telegram Connect

- [x] Implement widget settings, same-renderer instant preview, opt-in live testing, public-ID embed, visitor isolation, activation/deactivation and shared accounting.
- [x] Implement Telegram manager-bot identity linking, tenant confirmation, managed-bot connection, encrypted credentials and retry-safe webhook registration; retain manual fallback.
- [x] Verify 95 API tests, API build, web check (0 errors/warnings, 5 existing hints) and web build. Verify Web Chat UI actions in a local browser fixture.
- [ ] Obtain the platform Telegram manager @username and configure its Worker secrets; register its webhook using the operator script after deployment. Do not place secrets in chat or source control.
- [ ] Apply migration 027 and deploy the API/web changes to the intended environment, then run real visitor/provider and Telegram creation/reply journeys. No deployment has been performed in this change.
- [ ] Verify Telegram UI in a browser (local path was blocked by the browser), mobile layout, remote D1 concurrency and public-widget abuse controls against expected traffic.
- [x] Keep managed AI platform-wide through Worker `GEMINI_API_KEY`/`OPENAI_API_KEY`; separate its UI status from tenant-key provisioning and retain legacy project-key fallback for tenant mode. API build and 99/99 tests pass; web verification stalled without diagnostics.
- [x] Replace Chat Service provider/provisioning controls with an optional encrypted Gemini key and managed-Gemini fallback; add migration 028 and a tenant-level 90% auto-top-up preference. Local migration, API build, 100/100 tests, Astro check and web build pass.
- [ ] Implement managed credit-pack catalog pricing, saved-payment-method eligibility, idempotent Stripe off-session auto-purchases, webhook credit settlement, monthly limit enforcement and failure notifications before describing auto top-up as active purchasing.
- [x] Replace retired `gemini-2.5-flash-lite` with `gemini-3.5-flash-lite`, add a runtime compatibility alias and migration 029, and verify the configured local key with a successful HTTP 200 request plus API build and 100/100 tests.
- [x] Support multiple Web Chat widgets per Chat Service with ID-based management and compatibility routes. Telegram and WhatsApp already support multiple distinct installations. Migration 030 applied locally; API build and 101/101 tests pass. Web check stalled without diagnostics; deployment remains pending.
- [x] Add internal Web Chat widget names and tenant usage totals for widgets, completed messages, input tokens and output tokens. Migration 031 applied locally; API build, 101/101 tests and Astro check pass.
- [x] Fix Web Chat create 400 for local/page URLs: allow HTTP loopback origins, normalize page URLs to their origin, and return precise safe validation messages. API build and 101/101 tests pass.

The preceding Web Chat 'configuration-only' notes describe the prior implementation and are superseded by this local implementation entry. Streaming remains disabled.
