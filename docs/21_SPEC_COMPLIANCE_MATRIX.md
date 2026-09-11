# dLogicFlow Specification Compliance Matrix

## Interactive Forms — 2026-09-11

Local implementation covers template/draft creation, conditional typed fields, immutable publication, activation, labelled tests, hosted review/confirmation/receipt, tenant submission review and optional widget links. API enforcement covers feature availability, tenant/role isolation, encrypted retained answers, unfinished-answer privacy, version conflicts and duplicate submissions. Connector mapping prepares pending proposals only. Validation: 170 API tests pass (two remote tests skipped), API type check, full dashboard build and dashboard check pass. Manual browser acceptance and deployed environment checks remain pending; no deployment or remote migration. Scope and exclusions: docs/29_INTERACTIVE_FORMS.md.


## Feature availability — 2026-09-11

Local implementation: system-admin availability and tenant restrictions, operations read-only view, tenant availability reporting and server enforcement for existing chat/channel/action runtimes. Planned experiences/templates are registered but cannot be activated. Settings use migration 032 with atomic audit and version checks. No deployment. Automatic billing-plan mapping, affected-service counts and comprehensive creation-control hiding remain open; see docs/28_FEATURE_AVAILABILITY.md.

## Staff portal compliance — 2026-09-10

| Requirement | Local implementation | Release/coverage limits |
| --- | --- | --- |
| Separate role-specific Workers | Three independently dry-built apps with distinct portal permission ceilings | Remote Workers/Access applications not provisioned |
| Platform authentication | Cryptographic Access JWT verification plus explicit active staff grants; no tenant-role escalation | Requires configured issuer and distinct audiences; operator bootstraps approved staff |
| Cross-tenant usage/billing | Tenant balances, subscription status, usage, payment records, invoices, credit ledger and event status | Stored records; no live Stripe reconciliation or monetary mutations |
| Problem/contact operations | Unified source queue, assignments, status, internal notes, version conflicts, atomic audit/history and tenant status sync | Notes internal; latest 100 per case; attachments require R2 binding |
| Logs/troubleshooting | Safe persisted platform/tenant audit and channel/delivery/request metadata | No raw provider payloads or live Cloudflare log tail |
| Channel guardrail configuration | Admin/operations edit limits; web/social runtime enforces enabled/input/token/item/character controls | Applies to new channel AI calls; in-flight calls can finish; provider usage remains the billing basis |

Validation: 135 tests pass with 2 opt-in skipped, API/staff type checks and all three Worker dry builds pass; browser workflows verified with labelled sample data. No remote deployment or migration.


## Per-widget conversation and reply templates - 2026-09-10 (local only)

- Widgets independently store conversation_template, conversation_instructions (up to 2,000 characters), and output_template in existing config JSON. No new migration is required.
- Conversation options: existing Chat Service flow (backward-compatible default), customer support, lead qualification, booking enquiry, or custom conversation guidance. Non-default templates replace the service dialog runtime for that widget; provider and knowledge selection still use the selected service. Template flows are AI guidance, not deterministic state machines or booking integrations.
- Reply formats: conversational paragraphs (default), concise answer, plain-text bullet points, or numbered steps. These guide model output; they are not enforced JSON schemas or HTML templates. Rendering remains text-only.
- Current form selections drive the billed single-message preview. Public messages use stored widget settings only; visitors cannot override them. Public session responses expose appearance only, excluding conversation instructions.
- Validation: 120 API tests pass (2 opt-in remote tests skipped), API type check and full web build pass. Tests cover independent widgets, validation, preview settings, public override rejection, instruction non-disclosure, provider prompt propagation and unchanged success/failure accounting. Browser sample-data preview verified template selection, bullet replies and unsaved activation lock. Live UAT behavior is not verified; nothing deployed.


## Tenant journey compliance — 2026-09-10 (local implementation)

| Area | Evidence | Limits |
| --- | --- | --- |
| Channel onboarding | Actual tenant inventory; selected-widget resume; explicit install/activate/test steps; social deactivate/reactivate; atomic audit recording | Live provider delivery still requires UAT verification after an authorized release |
| Usage visibility | Project/period filtering; completed, failed and reserved request counts; completed-only token totals; tenant isolation regression | No per-channel attribution; balance and credit history remain in Billing |
| Conversation analytics | Latest signal per active conversation; coverage and overlapping flags; links to review; heuristic disclaimer | No validated predictive analytics; attention list limited to latest 50 |
| Conversation operations | Drafts survive polling and failed sends; checked HTTP errors and stale-render protection | Browser checks use sample responses |
| US-GOV-003 audit history | Owner/admin/billing read-only API/UI; actor/action/resource/time/request reference; pagination; no secret metadata exposure; transactional channel events | Partial: no historical backfill, comprehensive before/after snapshots or audited export/retention workflow |

Validation: API type check; 118 passing tests with 2 opt-in skipped; Astro check 0 errors/0 warnings/5 existing hints; full web build; isolated browser checks. No deployment or migration applied for this work.


## Verification update — 2026-09-10

- User requested that pending channel work remain local. Released only billing-period parsing, the Gemini model replacement/legacy alias, and safe Gemini upstream-status diagnostics by patching the downloaded deployed UAT Worker. No migrations or web deployment; migrations 027–031 remain pending. UAT bindings were compared and preserved, including disabled streaming. Production unchanged.
- Latest isolated UAT content ETag: `7d66449fab88a152747fdab712909a00d1546b88b3580043394134268577b147` (2026-09-10 06:21:47 UTC). Health returned HTTP 200 / `ok:true`. Snapshot, patch scripts, manifests and release artifact are under `.tmp/uat-isolated/` locally; do not deploy the full working tree as a replacement without reviewing the pending channel scope.
- Local API build passes; 111 tests pass, with two opt-in remote tests skipped in the ordinary run. Astro check passes with 0 errors, 0 warnings and 5 existing hints. No web build/release was performed in this task.
- Five new email-verification tests cover fresh, replayed, expired, used and missing/unknown tokens against real SQLite SQL. UAT has five expired verification tokens, one used/replaced token and no active token. User link was neither read nor consumed. Fresh-email approval/receipt and real-link verification remain pending.
- UAT D1 credit concurrency test passed: ten competing 200-unit reservations against 1,000 units admitted exactly five; concurrent duplicate settlement/refunds, zero/exact settlement, ledger reconciliation and rollback after a nonnegative-balance violation passed. Fixtures were cleaned up. This tests the application credit SQL via D1 REST, not full Worker HTTP load/streaming concurrency.
- Live managed Gemini response succeeded (23 input tokens, 1 output token, charge 5 credit units), with usage, reservation, account and ledger reconciliation. Initial fixture cleanup hit the non-cascading intelligence foreign key; cleanup order was corrected and that fixture removed. A later request returned PROVIDER_ERROR/502; repeatability is not yet established. Safe status diagnostics were added without retaining raw upstream error bodies.
- Final UAT AI smoke rerun passed, including automatic fixture cleanup. Across three calls, two succeeded and one returned 502; the intermittent failure remains unexplained. Final remote reconciliation found zero test tenants, zero negative accounts and zero ledger mismatches.
- Stripe sandbox identity and its subscription match UAT. Actual current API payloads place periods on subscription items; legacy-only parsing was fixed with missing-period preservation. Four signed lifecycle tests pass, including updates, cancellation, duplicate delivery and failed-event retry; these also passed against the isolated release artifact.
- Stripe sandbox has no webhook endpoint and UAT has no stored Stripe events. Automatic approval review rejected creating the persistent endpoint and replacing the UAT signing secret; explicit user approval is pending. No endpoint was created and no signing secret changed. Live subscription lifecycle/retry checks remain incomplete.
- Browser recovered the designated owner session. It has one workspace; account-switch/invitation and multi-workspace/Developer live journeys remain pending the relevant account/link. Prior invitation receipt/private-window acceptance remain user-confirmed; older non-delivery entries are historical.


Email-verification routing regression fixed and deployed to UAT: correct generated URLs, preserved proxy query strings and legacy redirect. 76 tests plus API/web checks/builds pass. Dummy-token deployment smoke passes; real verification token not exercised.

Invitation mismatch recovery deployed to UAT: dedicated API codes, explicit account-switch action with preserved next link, distinct expired/accepted/invalid copy. 74 API tests and builds/checks pass; live switching journey pending. Email receipt/private-window acceptance confirmed by user.

2026-09-09: Exact-reservation ledger omission fixed; zero/partial/full duplicate settlement SQLite tests pass (71 total API tests). UAT API deployed and healthy. Credit display field mismatches fixed and verified in UAT; no financial balance changes. Email receipt/acceptance and remote D1 concurrency remain open.

Branding override: dLogicFlow with `@dlogicflow/*` workspace packages; infrastructure and compatibility identifiers intentionally unchanged. Invitation form corrected and deployed to UAT; browser verifies successful invitation creation. Delivery and acceptance remain unverified. API tests 68/68 and API/web checks/builds pass.

## Verification update — 2026-09-08

- API build and 68/68 tests pass; Astro check reports 0 errors, 0 warnings and 5 hints, and build passes.
- Ten new route/SQLite tests execute the actual usage and credit SQL with relevant migrations. They cover settlement/ledger balance, non-stream parity, partial failure, cancellation, replay, final-line and split-chunk usage, missing usage, rejected upstream cancellation, and the disabled-stream gate. SQLite evidence is not remote D1/workerd concurrency evidence.
- Streaming remains disabled; provider terminal/error-event handling, timeout/load tests, exact-reservation consumption ledger and live D1 regression remain release gates.
- Migration `026_tenant_profile.sql` applied to UAT. API version `e5a8f46c-44c3-4abf-ac34-1b99c679d3e0` and web version `61945e40-d038-43c5-a4dd-c25b0dc22a83` deployed. API health and web-to-API health proxy pass. Authenticated tenant journeys await sign-in.
- Restored `gpt-5-mini` / `gemini-2.5-flash-lite` and previous pricing entries per user instruction. API build and 68 tests pass after restoration. Neither model's successful UAT invocation was verified today.
- Historical test/deployment claims in the table below do not supersede this dated verification result.

| Area | Specification | Source | Target |
|---|---|---|---|
| Product identity | dLogicAI | Mixed historical names may remain | Normalize |
| Auth | Required | Email verification, password reset, optional TOTP enrollment and enforcement, password policy, account deactivation, and invite continuation through registration/login added | Add recovery codes and delivery verification |
| Multi-tenant | Required | Explicit session tenant, named login selection, in-app workspace switching, membership validation, and tenant profile API/UI implemented | Add broader tenant lifecycle tests, ownership transfer, member removal, and pending-invite management |
| Projects | Required | Implemented | Maintain |
| Tenant onboarding | Required | Getting Started page provides a development sample and live project/service/dialog/knowledge checklist | Add executable sample credentials and deployment promotion actions |
| API keys | Required | Implemented | Test |
| OpenAI | Required | Implemented; GPT-5 Mini is the configurable managed secondary provider | Formalize provider interface |
| Gemini | Required | Implemented; Gemini 2.5 Flash-Lite is the managed default provider | Formalize provider interface |
| BYOK | Required | Implemented | Harden |
| Multi-language | Required | Basic | Improve |
| Usage reservation | Required | Implemented | Atomic/idempotent |
| Streaming settlement | Required | Actual-token implementation and OpenAI/Gemini parser unit coverage added; disabled by default through `STREAMING_ENABLED=false` for the non-streaming MVP | Add settlement integration, cancellation, concurrency, provider-sandbox, and live D1 regression coverage before enabling |
| AI credits | Required | Atomic reservation, failure refund, and idempotent non-streaming settlement implemented; managed AI reconciles actual token charge and refunds unused reservation credits | Add live D1 regression coverage and converge streaming settlement on actual token usage |
| Configurable billing | Required | Subscription/catalog/Stripe routes registered; billing mutations require owner/admin; managed-AI USD allowances and markup are data-configured and locally migrated | Configure matching remote Stripe prices and verify checkout, portal, and webhook flows end-to-end |
| BYOK subscription offer | Required | Configurable discount entitlement, estimator support, and Stripe coupon hook added | Configure live Stripe coupon and verify discounted Checkout |
| Cost estimator | Required | Partial | Expose API/UI |
| Stripe | Optional/target | Checkout, portal, and webhook handlers wired | Configure prices/secrets and verify end-to-end |
| Organization/team | Required | Super admin/owner, admin, developer, billing, and sales-operations roles; role-protected invitations; acceptance UI; member listing; and workspace switching implemented | Add role-change/removal, ownership transfer, invitation list/resend/revoke, and end-to-end UAT |
| Chat Services | Target | Project-scoped CRUD, editable configuration, Web Chat binding, knowledge-base attachment, and versioned dialog-flow configuration added | Implement runtime invocation and remaining channel adapters |
| Service requests | Required | Tenant-scoped create/list/detail API and dashboard tracking added | Add external service-desk synchronization |
| Intelligence | Target | Tenant-scoped baseline runtime signals are recorded for completed non-streaming conversations | Add deeper model-based analysis and streaming coverage |
| Knowledge bases | Target | Tenant/project-scoped metadata, secure R2 lifecycle, text/CSV/HTML/JSON extraction, bounded D1 chunking, processing API, retrieval, dashboard controls, plan-enforced cost limits, and optional post-index source deletion added | Add PDF/DOCX extraction, Queue processing, Vectorize retrieval, and monthly ingestion metering |
| Dialog flows | Target | Full-page visual designer with drag/drop states, Chat Service attachment, seven business-scenario templates, versioned configuration, active-state evaluation, slot/milestone persistence, outcome evidence, and progress API added | Add richer extraction, runtime preview, and outcome action execution |
| Connectors | Partial, local implementation | Native HubSpot contacts/tickets and business API bridge; encrypted credentials, tested activation, scoped sync/incoming records and response context, reviewed Queue writes, flow proposals, allowance settlement and audit history. Verified with 156 passing API tests and sample-data browser journeys; see docs/27_BUSINESS_CONNECTORS_RUNBOOK.md | Authorized migration/configuration and live HubSpot validation; native OAuth/webhooks, real marketplace adapters, visual action mapping and verified social-channel customer identity remain open |
| MVP navigation and support UX | Implemented in UAT | Task-based primary menu; environment selector removed; Report a problem supports private tenant-scoped screenshots | Validate with authenticated UAT users |
| Channel activation gate | Implemented in UAT | Telegram and WhatsApp installations start in testing; explicit activation is required before webhook traffic is accepted | Add automated end-to-end provider webhook tests |
| Public contact capture | Required | D1 lead capture with configurable Turnstile validation and marketing footer form added | Add CRM handoff and lead notification workflow |
| R2/KV/Queues | Target | Partial/unverified | Adopt where justified |
| Observability | Required | Partial | Complete |
| CI/CD | Required | Docs/partial | Verify workflows |
| OpenAPI | Required | Stale relative to newer artifacts | Reconcile |
| Tests | Required | 58 API tests pass; API typecheck, Astro check/build, and local/UAT D1 migration validation pass. Channel runtime tests cover settlement, replay, provider failure/refund, persistence failure/refund, and settlement-failure behavior. Deployed UAT health, web-to-API proxy, CORS, unauthenticated security, and reconciliation smoke checks pass | Add deployed UAT authenticated registration/login/subscription, managed-AI/live-channel, and streaming settlement integration coverage |

## Tenant channel setup journey — 2026-09-09

- Unified Web Chat, Telegram and WhatsApp setup with project/service selection, preserved service links, channel-specific credentials, loading/empty/error states and callback URLs. Messaging installations retain explicit activation and removal.
- API now requires the outbound credentials for messaging installations; WhatsApp callback verification accepts testing installations while inbound customer messages remain active-only. Web channel writes now require service-management roles.
- Web Chat setup saves website configuration only. The legacy embed exposes a project API key in browser code; a safe public widget/session flow and domain enforcement remain required before tenant website activation. No production-readiness claim is made.
- Verification: 82/82 API tests pass, API TypeScript build passes, and both changed browser scripts pass syntax validation. Astro check stalled without diagnostics and was interrupted; web build verification remains pending. Authenticated browser/provider journeys were not exercised. No deployment performed.

- Web check and standalone build both stalled without diagnostics and were interrupted; browser and live-provider verification remain outstanding.

## Web Chat embed and Telegram Connect — 2026-09-09

- Implemented `/dashboard/webchat`: project/service selection, appearance settings, instant preview using the production renderer, opt-in billed live tests, copyable public-ID embed, activation/deactivation and website-origin configuration. The old embed page redirects here and no longer asks tenants to expose a project API key.
- Added widget-scoped visitor sessions, exact-origin credential-free CORS, atomic rate limits, isolated conversations, replay protection and existing provider/knowledge/dialog/credit accounting through a shared response handler. New widgets start in draft; origin changes return them to draft; deactivation rejects subsequent messages from existing visitors.
- Added `/dashboard/telegram-connect`: short-lived identity linking through the manager bot, explicit dashboard identity confirmation, Telegram-hosted managed-bot creation, encrypted token retrieval, retry-safe automatic webhook registration and explicit testing-to-active handoff. Ownership-change updates deactivate the previous installation. Existing manual bot setup remains available.
- Added migration `027_webchat_telegram_onboarding.sql` and operator manager-webhook setup script. Migration has been exercised on SQLite in tests; it has not been applied to UAT/production. Platform manager username/token/webhook-secret setup remains required; no real Telegram bot was created or registered during this work.
- Verification: 95/95 API tests pass; API build passes; web check has 0 errors, 0 warnings and 5 existing hints; production web build passes. Tests include widget success/refund/replay with actual credit SQL, tenant/visitor/origin isolation, expiry/rate limits and Telegram identity, retry, duplicate and ownership handling.
- Browser verification used an explicitly labelled local fixture with mocked workspace/provider responses. Verified preview customization, demonstration/live-test switching, copyable embed, activation, customer widget replies and rejection after deactivation. Desktop layout inspected. The browser blocked the local Telegram setup URL; full Telegram UI and live-provider journeys remain unverified. A reliable mobile viewport verification remains outstanding.
- Managed mode now reads only platform Worker provider bindings, including `GEMINI_API_KEY`; tenant mode uses tenant credentials with an active project-key compatibility fallback. The editor distinguishes these modes and receives only availability booleans. API build and 99/99 tests pass; web check/build stalled without diagnostics and was interrupted. No deployment performed.
- Chat Service UI now uses a single optional encrypted Gemini key; when absent, managed Gemini is selected automatically. Migration 028 is applied locally only. The 90% managed-credit auto-top-up preference is persisted, while the actual Stripe credit-pack purchase trigger remains a release gap pending pricing, off-session payment, idempotent webhook settlement, limits and failure handling. API build and 100/100 tests pass; Astro check has 0 errors/0 warnings/5 existing hints and the web build passes. No deployment performed.
- Managed Gemini now uses `gemini-3.5-flash-lite`; the prior 2.5 model returned a Google 404 for this key. Runtime compatibility and migration 029 repair existing stored model values. A direct minimal request succeeded with HTTP 200 and usage metadata; local migrations, API build and 100/100 tests pass. No deployment performed.
- Multi-installation onboarding supports distinct Telegram bots and WhatsApp accounts plus multiple Web Chat widgets per Chat Service. Migration 030 preserves existing widget/session data while removing the service uniqueness constraint; widget management is ID-based with legacy endpoint compatibility. Local migration, API build and 101/101 tests pass. Astro check stalled without diagnostics and was interrupted; no deployment performed.
- Migration 031 adds internal names for Web Chat widgets without exposing them in public embed configuration. Tenant usage reporting now includes current widget count and period totals for completed messages, input tokens and output tokens. Migration 031 is applied locally; API build, 101/101 tests and Astro check pass. No deployment performed.
- No deployment performed. Production unchanged. Detailed behavior and platform setup: `docs/24_CHANNEL_ONBOARDING_JOURNEY.md`.
