# dLogicFlow — PROJECT_STATE

## Interactive Forms — 2026-09-11 (local testing)

- Implemented service-scoped draft/template builder, typed conditional fields, test links, immutable publication, activation/deactivation, hosted completion/review/receipt, submission review and opt-in Web Chat links. Forms remain disabled by default until platform activation.
- Encrypted answers, hashed expiring session tokens, tenant/role isolation, optimistic updates and idempotent submission are covered. Tenant reviewers cannot read unfinished answers. Retention is enforced on reads and scheduled ciphertext cleanup; real submissions can prepare a reviewed pending connector proposal, never an automatic external write.
- Verification: 170 API tests pass, two opt-in remote tests skipped; API type check and full dashboard build pass; ordinary dashboard check reports zero errors, zero warnings and seven hints. Local sample preview responds at http://127.0.0.1:4345/dashboard/forms. Browser automation was unreliable, so a completed interactive browser walkthrough is not claimed.
- Migration 034 and all changes remain local. See docs/29_INTERACTIVE_FORMS.md for release prerequisites and limits: no uploads, CRM prefill, automatic email or inline social forms. Full deployment/authentication and live connector verification remain pending.


## Platform feature availability — 2026-09-11 (local)

- Dashboard validation limitation: the current Astro check did not produce a result after prolonged local dependency startup; no fresh successful web check/build or browser interaction result is claimed for this change. Verify the tenant availability page and staff controls before release.

- Verification: 161 API tests pass, two remote opt-in tests skipped; API and staff TypeScript checks pass and git diff whitespace checks pass. Tests cover admin-only mutations, optimistic concurrency, atomic audit rollback, tenant restriction isolation, immediate/retirement semantics, planned-feature denial and pre-provider/pre-credit rejection in streaming and non-streaming paths. Staff browser script parses. Fresh browser interaction testing has not been performed.

- Added audited system-admin feature availability and tenant allow/deny, operations read-only visibility and a tenant availability page linked from Chat Services.
- Catalog covers Q&A/guided chat, channel adapters, connector actions and planned forms/questionnaires/surveys/capabilities/templates. Unimplemented runtimes cannot be activated. Existing billing entitlements remain independent.
- Checks cover API/widget replies, social AI and queued delivery, connector writes/approval, channel activation and flow publishing. Immediate stop and conversation-cutoff retirement preserve data; connector actions support immediate stop only.
- Uses migration 032 settings; no new migration or remote changes. Detailed behavior and limitations: docs/28_FEATURE_AVAILABILITY.md. Impact counts, automatic billing-plan mapping and hiding every unavailable creation control remain future refinements.


## HubSpot business connectors — 2026-09-10 (local only)

- Implemented the user-selected native HubSpot adapter and shared business API bridge: encrypted credentials, real connection tests, activation, service bindings, manual/paged scheduled contact sync, signed incoming bridge events and tenant-scoped records with freshness/deletion rules.
- Responses can use approved public records or customer-private CRM fields after a short-lived assertion issued by a trusted tenant backend. Widget sessions bind the verified customer; per-widget opt-out disables business context and flow action proposals. Social channels currently use public records only.
- Contact and ticket creation requires a pending proposal, exact-data review and owner/admin approval before Queue execution. Dialog outcomes can prepare mapped proposals; the visual mapping editor is not included. Ambiguous writes retain allowance for explicit reconciliation and are not automatically repeated.
- Connector entitlement and allowance reservation are checked before external calls; settlement, metering and billing events are idempotent. Added redacted audit/run history and additive migration 033_business_connectors.sql. No default pricing or entitlements are enabled.
- Verification: 156 API tests pass, two opt-in remote tests skipped; API type check, Worker dry build and dashboard build pass. Dashboard check has zero errors/warnings and five existing hints. Browser checks used the actual UI with labelled local fixtures for test, binding, activation, sync, proposal review and queueing.
- Nothing deployed or connected to a live HubSpot account. Release requires migration 033 after prior pending migrations, approved entitlement/pricing, Queue/Cron bindings, credentials and a tenant customer-identity backend. OAuth, native HubSpot webhooks, marketplace adapters and live CRM smoke checks remain outside this implementation. See docs/27_BUSINESS_CONNECTORS_RUNBOOK.md.

## Staff portals — 2026-09-10 (local implementation)

- User requested separate system-admin, operations and billing Cloudflare Workers. Added independent apps/system-admin, apps/operations and apps/billing entrypoints/configs/packages, sharing apps/staff-shared APIs and UI. No Workers or Access applications were created remotely and no migrations were applied remotely.
- Authentication verifies Cloudflare Access JWT signature/issuer/audience/expiry, then requires an active platform_staff grant. Tenant owners/admins receive no staff access. Each portal enforces a permission ceiling; billing cannot access guardrails or system/platform logs, operations cannot update global settings or enter the admin portal. JSON mutations require same-origin requests.
- All portals provide tenant balances/subscription status, tenant usage, recorded credit purchases, invoices, credit ledger, billing event status and a shared queue of problem reports and contact enquiries. Records are paginated (50/page), with tenant/date/search filters where applicable and All time support.
- Issues support assignment to platformadmin/operations/billing, submitted/in_progress/waiting/resolved/closed status and required internal progress notes. Version conflicts are rejected. Case mutation/history/audit commit atomically; tenant-visible problem status/progress is synchronized. Authenticated screenshot downloads are audited and require DATA_BUCKET.
- Admin/operations provide platform and tenant audit views plus persisted request/channel/delivery diagnostics. System admin additionally exposes global channel-AI enable/disable, support-email metadata and an explicit staff roster. Staff granting/revocation remains an operator action documented in the runbook.
- Admin/operations can update per-channel enabled, input length, generated-token, reply-item and reply-character limits. Web Chat preview/live requests and social-channel AI processing enforce these limits before invocation/persistence/delivery; billing still uses actual generated-token usage. In-flight calls may finish; non-channel tenant API requests retain existing behavior.
- Added additive migration 032_staff_portals.sql, staff type/build scripts, CI validation and an offline release-config generator. No default staff identities, payment credentials or authentication bypasses are introduced.
- Verification: 135 API tests pass, 2 opt-in remote tests skipped; tenant API and staff type checks pass; all three Wrangler dry builds pass. Tests cover signed/forged/expired/wrong-audience Access assertions, grant revocation, role boundaries, CSRF, assignment/status/history, stale updates, audit rollback, all dashboard SQL on actual migrations, older-case pagination, guardrail validation and live-path cap/accounting behavior.
- Browser checks used the actual shared UI with explicitly labelled localhost sample-data APIs: operations-to-billing assignment and progress history, billing payment views, admin guardrail saving and role-specific navigation. Production Access and live tenant/payment/channel integration still require an authorized release and environment smoke checks.
- Scope limits: financial views show stored records rather than live Stripe reconciliation; no charge/refund actions. System diagnostics are persisted application events, not Cloudflare log streaming. Internal issue notes are not emailed. The deployment/runbook is docs/26_STAFF_PORTALS_RUNBOOK.md; requirements are docs/25_STAFF_PORTALS_SPEC.md.


## Per-widget conversation and reply templates - 2026-09-10 (local only)

- Widgets independently store conversation_template, conversation_instructions (up to 2,000 characters), and output_template in existing config JSON. No new migration is required.
- Conversation options: existing Chat Service flow (backward-compatible default), customer support, lead qualification, booking enquiry, or custom conversation guidance. Non-default templates replace the service dialog runtime for that widget; provider and knowledge selection still use the selected service. Template flows are AI guidance, not deterministic state machines or booking integrations.
- Reply formats: conversational paragraphs (default), concise answer, plain-text bullet points, or numbered steps. These guide model output; they are not enforced JSON schemas or HTML templates. Rendering remains text-only.
- Current form selections drive the billed single-message preview. Public messages use stored widget settings only; visitors cannot override them. Public session responses expose appearance only, excluding conversation instructions.
- Validation: 120 API tests pass (2 opt-in remote tests skipped), API type check and full web build pass. Tests cover independent widgets, validation, preview settings, public override rejection, instruction non-disclosure, provider prompt propagation and unchanged success/failure accounting. Browser sample-data preview verified template selection, bullet replies and unsaved activation lock. Live UAT behavior is not verified; nothing deployed.


## Tenant journey refinement — 2026-09-10 (local only)

- Explicit user scope: refine tenant channel creation/activation, usage tracking, conversation analytics and audit history. This work remains local with the pending channel bundle; no UAT or production deployment and no migrations were applied.
- Channels now list actual tenant connections with their project, service, status and resume links. Web Chat resumes the selected widget and explains configure/save/install/activate/test steps. Social connections support audited deactivation/reactivation without discarding settings.
- Added tenant-scoped /v1/operations reporting endpoints and shared dashboard navigation. Usage supports project and rolling-period filters, completed/failed/reserved request counts and completed-only token totals. Billing remains the source for balances; usage has no per-channel attribution.
- Analytics counts each active conversation once using its latest intelligence record, reports analysis coverage and overlapping negative/urgency/escalation signals, and links the latest 50 flagged conversations to their message windows. These are heuristic review signals, not validated predictions.
- Audit history is read-only for owner/admin/billing, with period/action filtering and 50-row pagination. Channel creation (including managed Telegram), widget edits/status changes, social activation/deactivation/removal record actor, tenant, action, resource, timestamp and generated request reference atomically with the mutation. Unmatched writes produce no event. No credentials, message bodies or raw metadata are exposed.
- Conversation polling preserves drafts, handles failed sends/pause operations, prevents older requests replacing newer windows, and removes hard-coded channel availability claims.
- Validation: API type check passes; 118 tests pass, 2 opt-in remote tests skipped. Astro check: 0 errors, 0 warnings, 5 existing hints. Full Cloudflare dashboard build passes. Inline interaction scripts parse. Browser checks with isolated sample-data preview passed for usage totals/empty filters, analytics-to-conversation navigation, draft preservation across polling and failed sends, audit action filtering, connection inventory and widget selection.
- Normal Cloudflare local preview timed out twice. Browser verification used a temporary adapter-free Astro config with sample API responses under .tmp/astro-journey.config.mjs; API behavior was verified separately against real SQLite in regression tests. This does not verify live Telegram/WhatsApp delivery or UAT end-to-end behavior.
- Remaining governance scope: comprehensive before/after audit snapshots and audited export/retention workflows are not implemented by this refinement. Older actions are not backfilled. Existing remote email, Stripe webhook and AI-repeatability verification items below remain open.


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


## Approved branding change

Verification-link fix deployed to UAT: API `dac8dbdd-42ad-4a9e-824f-15cc5d8b3fba`, web `4a2dfa2e-a928-477c-b813-a51201e7291a`. Registration/resend links target the web API proxy, query strings are preserved, and legacy links redirect with no-store/no-referrer. 76 tests and builds/checks pass; dummy-token smoke reaches API validation, not 404. User token was not consumed.

Invitation UX update (2026-09-09): mismatched signed-in accounts receive a dedicated error and explicit Switch account button preserving the invitation token through login. Accepted, expired and invalid links have distinct copy. API tests 74/74 and API/web checks/builds pass. Deployed UAT API `037c94b5-9cb2-4a67-bee0-6642f4b192eb`, web `15d66e7f-06a4-414f-bf3a-e06d3e3b95c6`. Live switching journey not exercised; user confirmed earlier email receipt and private-window acceptance. Production unchanged.

Tagline updated to “Customer Engagement Platform”. Dashboard header/sidebar and footer use fixed, non-shrinking logos beside stacked brand text; infrastructure remains unchanged.

Tagline UAT web release: `dc019ea7-28f5-4863-98d2-f6abe1156b84`. Web check/build completed successfully; live Team-page DOM and screenshot confirm the tagline and aligned brand block. No production changes.

The product is now dLogicFlow; workspace packages use `@dlogicflow/*`. Historical dLogicAI references below describe earlier work. Existing Workers, databases, buckets, queues, URLs, service bindings and compatibility identifiers retain their existing names per user instruction.

Verified UAT release: API `c0bcd247-7f0c-4b89-9d98-50b092342613`, web `6d40a6bb-0e5b-4e3e-8dad-9204e4b83a1d`. API tests 68/68, API/web builds and Astro check pass (0 errors, 0 warnings, 5 hints). Browser confirms dLogicFlow branding, retained owner session and a real Team invitation form. Approved Developer invitation submitted once after the fix; UI confirms creation, not delivery. Inbox receipt and acceptance remain unverified. Production unchanged.

> Living implementation state. This file describes what is true **now**.
> The `docs/*.md` files describe the intended product and technical specifications.

## Latest verification — 2026-09-08

### Follow-up — 2026-09-09

- Fixed exact-reservation consumption ledger omission by skipping zero-refund INSERTs that reset SQLite `changes()`. Added zero/partial/full charge duplicate-settlement SQL regressions; API build and 71/71 tests pass. UAT API `22427676-6c3e-4312-b4a5-38e7ba475659` deployed and health verified. Remote D1 concurrency remains unverified.
- Fixed credit UI contract mismatches: overview reads `/v1/billing/credits`; breakdown uses subscription/purchased/promotional fields. Web check/build pass; UAT web `df3f8723-a182-4942-804a-b3aa60939fcf` deployed. Live Credits page shows 2,000,000 available and subscription units, matching its initial grant. No balances changed.
- Invitation recipient reports no email. UAT has EMAIL_FROM and RESEND_API_KEY secret names, but background send results are neither returned nor stored; sender delivery logs are needed. No additional invitation sent.

- Fixed streaming-parser imports, replay rejection before quota/provider invocation, final usage-line parsing, missing-usage refund, cancellation cleanup and safe stream errors. Streaming remains disabled.
- Added ten response-route tests exercising real credit/usage SQL on SQLite with relevant migrations; API build and 68/68 tests pass. Astro check: 0 errors, 0 warnings, 5 hints; web build passes. These tests do not establish remote D1 concurrency or live-provider correctness.
- Restored managed GPT-5 Mini / Gemini 2.5 Flash-Lite and previous pricing entries following user confirmation.
- Applied UAT migration 026. Deployed API `e5a8f46c-44c3-4abf-ac34-1b99c679d3e0` and web `61945e40-d038-43c5-a4dd-c25b0dc22a83`. API `/health` and web `/api/health` both return `ok:true`; unauthenticated dashboard navigates to login. Production unchanged.
- Designated UAT account requires user sign-in before invitation/workspace journeys. Successful managed-provider requests remain unverified. Exact-reservation consumption-ledger coverage, terminal/error-event handling, D1 concurrency and timeout/load tests remain open.
- This dated entry supersedes older test counts and deployed-version claims below.

## 1. Project Identity

- Product name: **dLogicAI**
- Product type: Conversational API / AI application platform
- Primary purpose: secure, scalable, tenant-aware conversational API.
- Primary consumers: web, mobile, business, and enterprise applications.
- Primary infrastructure ecosystem: Cloudflare.

### Naming Rule

The product name is **dLogicAI**. Do not introduce new user-facing references to DialogicAI/Dialogic AI unless required for historical migration or compatibility.

## 2. Technology Stack

### Frontend
- Astro
- Tailwind CSS

### API
- Cloudflare Workers
- Hono
- TypeScript

### Database
- Cloudflare D1
- SQLite-compatible SQL

### Cloudflare Services
- D1 — transactional application database
- R2 — object/blob storage
- KV — low-latency configuration/cache where justified
- Queues — asynchronous processing where justified
- Analytics/observability — operational visibility

### AI Providers
- OpenAI
- Google Gemini

The architecture must allow additional providers.

### Billing
- Free tier
- Subscription plans
- Bundled offers
- Configurable pricing
- Add-ons
- Usage-based overages
- AI credits
- Connector API-call allowances and overages
- Cost estimator
- Optional Stripe integration

### BYOK
BYOK is an optional capability for tenant/project provider keys and is not the primary product positioning.

## 3. Solution Architecture

```text
                    Web / Mobile Applications
                              |
                              v
                       Astro / Web UI
                              |
                              v
                  Cloudflare Worker + Hono
                              |
        +---------------------+----------------------+
        |          |          |          |           |
        v          v          v          v           v
      Auth       Core        AI        Usage       Billing
     Tenant     Services    Engine     Quota       Pricing
        |          |          |          |           |
        +----------+----------+----------+-----------+
                              |
                    Cloudflare Platform
                              |
             +----------------+----------------+
             |                |                |
             v                v                v
            D1               R2          KV / Queues
             |
             +----------------+
                              |
                 +------------+------------+
                 |                         |
                 v                         v
             AI Providers           External Systems
            OpenAI/Gemini          Connectors/Stripe
```

## 4. Core Domains

1. Authentication
2. Tenant / Organization Management
3. Corporate Teams / Memberships
4. Projects
5. API Keys
6. AI Providers
7. BYOK
8. Conversations
9. Messages
10. Usage / Quotas
11. Billing / Pricing
12. AI Credits
13. Connectors
14. Chat Services
15. Conversation Intelligence
16. Observability
17. Governance / Audit
18. Deployment / CI/CD

## 5. Current Implementation Status

| Domain | Status | Notes |
|---|---|---|
| Cloudflare Worker/Hono | 🟢 Implemented | Core API runtime |
| Astro frontend | 🟢 Implemented | Main frontend with logged-in user context and Getting Started onboarding journey; UAT registration SSR is verified after moving request-derived country context into page frontmatter |
| Tailwind CSS | 🟢 Implemented | UI styling |
| D1 schema | 🟢 Implemented | Primary relational state |
| Authentication | 🟡 Partial | Email verification, password reset, Resend delivery, optional TOTP enrollment, login-time 2FA enforcement, invite continuation through login/registration, and named multi-workspace selection are implemented; recovery codes remain |
| Tenant isolation | 🟡 Partial | Sessions bind an explicit tenant; validated organization switching is implemented; broader tenant lifecycle hardening remains |
| Organization management | 🟡 Partial | Tenant profile read/update, member listing, role-protected invitations, invitation acceptance UI, and membership-validated workspace switching are implemented; pending-invite management, member removal, and ownership transfer remain |
| Corporate team management | 🟡 Partial | Super admin/owner, admin, developer, billing, and sales-operations roles are recognized; invitations support non-owner roles and new users can preserve an invite through registration/login. Role-change/removal administration remains |
| Projects | 🟢 Implemented | Tenant/project scoped |
| API keys | 🟢 Implemented | Hashed secret storage, listing, and deactivation |
| OpenAI | 🟢 Implemented | Provider integration |
| Gemini | 🟢 Implemented | Provider integration |
| Provider abstraction | 🟡 Partial | OpenAI/Gemini adapters implemented; managed routing defaults to Gemini 2.5 Flash-Lite and a platform deployment toggle can promote GPT-5 Mini. |
| BYOK | 🟢 Implemented | Encrypted tenant-wide credentials available to all projects; project-level legacy credentials retained |
| Multi-language | 🟢 Basic | Heuristic language detection |
| Conversations | 🟢 Implemented | Core conversation flow; dashboard playground and tenant-user pause/resume takeover controls added |
| Messages | 🟢 Implemented | Conversation messages and authenticated direct agent replies |
| Usage reservation | 🟢 Implemented | Requires atomicity/hardening |
| Usage settlement | 🟡 Partial | Actual-token streaming settlement has route/SQLite regression coverage as of 2026-09-08, including cancellation, refunds, replay and non-stream parity. D1/workerd concurrency, provider terminal/error handling and live-provider verification remain; streaming stays disabled. |
| AI credits | 🟡 Partial | Managed AI reserves before invocation and settles actual token charges with unused source-bucket refunds. Ten route tests now exercise real accounting SQL locally; exact-reservation consumption-ledger coverage and remote D1 regression remain open. |
| Credit ledger | 🟡 Partial | Reservation, consumption settlement, and refund entries implemented; token-level lifecycle remains incomplete |
| Configurable billing | 🟡 Partial | Configurable USD managed-AI catalog uses Free ($2), Builder ($15), Growth ($50), and Business ($200) monthly allowances with plan-configured markup; request counts are safeguards, not a second billable allowance. Local D1 migrations verified; remote billing integration requires verification. |
| BYOK subscription offer | 🟡 Partial | Tenant-wide key detection automatically selects the configurable fixed BYOK Stripe Price; live Stripe Price configuration remains |
| Billing API | 🟡 Partial | Subscription state, catalog, replacement Checkout upgrades, seven-day trial period display, delayed trial activation, billing-portal, and authenticated Checkout confirmation routes are registered; owner/admin enforcement and redirect validation added; end-to-end verification remains required |
| Cost estimator | 🟡 Partial | API/UI integration requires verification |
| Stripe | 🟡 Partial | Checkout, billing portal, and signed-webhook handlers are wired to the subscription page; trial expiry uses Stripe trial_end, in-place upgrades use the upgrade timestamp, replacement Checkouts cancel prior subscriptions, and renewals advance period dates; failed webhook retries and migration ordering fixed; Stripe configuration and end-to-end verification remain required |
| Connector billing | 🟡 Partial | Schema/business logic ahead of runtime |
| Connector runtime | 🟡 Partial | Channel adapters plus environment-scoped commerce connector installations, encrypted credentials, credential tests, operation records, and Amazon/Shopee/Lazada/TikTok Shop UI implemented; real marketplace API adapters, retries, and dialog-flow connector execution remain |
| Chat Services | 🟡 Partial | Project-scoped CRUD, editable business-function settings, managed/tenant provider selection, Web Chat and Telegram/WhatsApp installation/conversation mapping, service-targeted provider resolution, knowledge-base attachment, and versioned dialog-flow configuration implemented. Telegram/WhatsApp inbound queue processing now loads bounded history, invokes the shared non-streaming provider/accounting services, persists the assistant response, creates an idempotent outbound delivery, and applies explicit refund/settlement failure paths. Provider webhook registration and live UAT message verification remain. |
| Service requests | 🟡 Partial | Tenant-scoped create/list/detail API and dashboard tracking added; external service-desk synchronization remains |
| Conversation Intelligence | 🟡 Basic | Completed non-streaming responses create tenant-scoped baseline intent, sentiment, urgency, purchase, escalation, and handoff signals; deeper analysis remains |
| Knowledge Bases | 🟡 Partial | Tenant/project-scoped metadata, secure R2 lifecycle, text/CSV/HTML/JSON extraction, bounded overlapping D1 chunks, processing API, and Chat Service-scoped lexical retrieval implemented. Plan-configured KB, document, storage, chunk, attachment, file-size, and retrieval-context limits are enforced; owners/admins can delete processed R2 sources while retaining indexed chunks. PDF/DOCX extraction, Queue processing, Vectorize indexing, and monthly ingestion metering remain. |
| Dialog Flows | 🟡 Runtime foundation | Full-page React Flow designer with drag/drop states, service attachment context, seven business-scenario templates, versioned visual configuration, active-state evaluation, explicit slot extraction, milestone persistence, outcome evidence, and progress API implemented; connector actions and richer extraction remain |
| R2 usage | 🟡 Partial | Knowledge-base document lifecycle uses tenant-scoped DATA_BUCKET objects; broader application usage requires verification |
| KV | 🟡 Planned | Not confirmed active |
| Queues | 🟡 Partial | Telegram/WhatsApp inbound runtime and dedicated UAT queue implemented; large/binary document extraction queue remains future work. |
| Analytics | 🟡 Planned | Consent-gated Google Analytics 4 integration added; measurement ID is not enabled by default |
| Public contact leads | 🟡 Partial | Turnstile-configurable public form and D1 lead capture added; CRM handoff remains |
| Observability | 🟡 Partial | Requires complete application telemetry |
| Data governance | 🟡 Reference | Dashboard is reference-only; retention and deletion enforcement remains |
| CI/CD | 🟡 Partial | UAT API and web deploy successfully. A checked-in preparation script preserves the UAT Worker name, API URL, and API service binding in Astro's generated deploy configuration; tenant-facing environment promotion remains unimplemented. |
| Automated tests | 🟡 Partial | 58 API tests pass across accounting, tenant roles/invitations, channel adapters/runtime, and streaming token parsing; API typecheck and Astro check/build pass. Deployed UAT health, proxy, CORS, unauthenticated security, and empty-stuck-state reconciliation checks pass; authenticated UAT and live provider/channel integration coverage remain required. |
| OpenAPI | 🟡 Partial | Must be reconciled with latest implementation |

## 6. Authentication State

Authentication currently uses:
- User accounts
- Password authentication
- Session-based authentication
- Tenant membership
- A same-origin Astro `/api` proxy for browser requests, so the HttpOnly session cookie is retained when the web UI and Worker use different origins.

Effective auth context must ultimately provide:

```text
userId
tenantId
role
```

The active tenant must be explicit. Multi-organization users must not be assigned an arbitrary tenant based on membership ordering.

## 7. Tenant Isolation

All tenant-owned resources must enforce tenant isolation, including organizations, members, projects, API keys, provider/BYOK credentials, conversations, messages, usage, billing, credits, connectors, Chat Services, intelligence data, and audit records.

Tenant ID must be derived from authenticated context rather than blindly trusted client input.

Cross-tenant conversation authorization is not required.

## 8. Organization / Corporate Model

Target model:
- Organizations / tenants
- Memberships
- Roles
- Invitations
- Organization switching

Target roles:
- Owner
- Admin
- Member

Administrative operations must enforce role authorization.

## 9. Project Model

Projects belong to an organization/tenant and scope:
- API keys
- AI providers
- BYOK credentials
- Conversations
- Chat Services
- Connectors
- Usage
- Configuration

Project access must validate tenant ownership.

## 10. API Key Model

API keys must:
- Use cryptographically secure randomness.
- Store only a secure hash.
- Return plaintext only at creation.
- Never expose stored secrets later.
- Be associated with the correct tenant/project.
- Support activation/revocation.
- Support plan-based limits where applicable.

## 11. AI Provider Architecture

Initial providers:
- OpenAI
- Google Gemini

Target abstraction:

```typescript
interface AIProvider {
  generate(request): Promise<ProviderResult>;
  stream(request): Promise<ProviderStream>;
  calculateCost(usage): number;
}
```

Provider-specific behavior remains behind provider adapters.

## 12. Model Selection

Model selection may be:
- Explicit
- Automatically resolved
- Provider-policy driven

Provider/model configuration must remain configurable.

## 13. BYOK State

Requirements:
- Encrypt credentials at rest.
- Never expose stored plaintext credentials.
- Validate credentials where appropriate.
- Associate credentials with tenant/project.
- Apply configurable BYOK service/API-call fees.
- Do not position BYOK as the primary product value proposition.

## 14. Multi-Language State

The API supports multilingual requests. Current implementation includes heuristic language detection.

Expected fields:
```text
input_language
output_language
response_language
locale
```

Language behavior must not break provider routing or billing.

## 15. Conversation Lifecycle

```text
Authenticate
    |
    v
Resolve Tenant / Project
    |
    v
Validate Request
    |
    v
Resolve Language
    |
    v
Resolve Provider / Model
    |
    v
Reserve Usage / Credits
    |
    v
Invoke AI Provider
    |
    v
Persist Response / Message
    |
    v
Settle Usage / Billing
    |
    v
Finalize Reservation
```

Failure path:

```text
Reservation
     |
     v
Provider failure
     |
     v
Refund / failure settlement
     |
     v
Ledger reconciliation
```

## 16. Usage / Quota State

Usage must be reserved **before** external AI provider invocation.

Target lifecycle:

```text
reserved
   |
   +----> completed
   |
   +----> refunded
   |
   +----> failed
```

Usage should include tenant, project, provider, model, request ID, conversation, token counts, provider cost, customer charge, status, and timestamp.

Reservation and settlement must be idempotent.

## 17. AI Credits

Credit lifecycle:

```text
grant
  |
reserve
  |
consume
  |
  +----> refund
  |
  +----> expire
  |
purchase
  |
adjustment
```

Required invariants:
- Reservation is atomic.
- Balance cannot become negative.
- Concurrent requests cannot overspend.
- Every balance change has an auditable ledger entry.
- Failed provider/usage operations follow the defined refund path.
- Credit accounting reconciles with usage accounting.

## 18. Billing / Pricing

Pricing must be configurable.

Commercial model:

```text
Subscription
     +
Bundled Allowances
     +
Add-ons
     +
Usage Overages
     +
Connector Overages
     +
Optional BYOK Service Fees
```

Customer pricing should be derived from plans, pricing rules, usage, provider cost, add-ons, overages, and BYOK rules. Avoid hard-coded customer pricing multipliers.

## 19. Cost Estimator

The platform should forecast:
- Subscription cost
- Included usage
- AI usage
- Provider usage
- Add-ons
- Connector calls
- Connector overages
- Expected overage cost
- BYOK service charges

The estimator must use the same canonical configurable pricing rules as billing.

## 20. Connector Architecture

Target categories:
- CRM
- ERP
- REST APIs
- GraphQL APIs
- Databases
- Cloud storage
- Collaboration tools
- Business systems

Requirements:
- Definitions
- Credentials/secrets
- Encryption
- Scoped permissions
- Execution abstraction
- Usage tracking
- Included API calls
- Overage billing
- Retry handling
- Async execution where appropriate

## 21. Chat Services

A Chat Service is a reusable conversational configuration associated with a project.

Expected configuration:
- Provider
- Model
- System behavior
- Language behavior
- Safety policies
- Knowledge
- Connectors
- Usage/billing policy
- Observability

CRUD APIs and runtime invocation must be project scoped.

## 22. Conversation Intelligence

Target intelligence includes:
- Intent
- Sentiment
- Emotion
- Frustration
- Urgency
- Customer effort
- Confusion
- Purchase intent
- Upsell probability
- Cross-sell probability
- Churn risk
- Escalation risk
- Refund risk
- Conversion probability
- Abandonment probability
- Next-best action
- Next-best offer
- Entities
- Topics
- Preferences
- Constraints

Schema may exist before runtime intelligence is complete.

## 23. Database State

Primary database:
```text
Cloudflare D1
```

Expected core entities:
```text
users
tenants / organizations
memberships
invitations
projects
api_keys
provider_credentials
conversations
messages
usage_events
plans
subscriptions
pricing_rules
add_ons
credit_accounts
credit_ledger
credit_reservations
credit_purchases
connectors
connector_usage
chat_services
conversation_intelligence
audit records
```

Migration identifiers must be unique. Production migration history must not be rewritten casually.

## 24. Cloudflare Bindings

Expected:
```text
D1
R2
KV
Queues
Analytics / observability
```

Only actually used bindings should be marked active; unused bindings remain planned.

## 25. Security State

Requirements:
- Secure password hashing.
- Constant-time credential comparisons.
- Cryptographically secure API-key generation.
- API-key hashing.
- One-time API-key secret display.
- AES-GCM or equivalent authenticated encryption for BYOK.
- Secure session cookies.
- Tenant isolation.
- Role-based authorization.
- Explicit production CORS allowlist.
- Safe provider error normalization.
- No provider credentials in logs.
- Audit sensitive administrative/billing operations.

## 26. Observability

Capture:
- Request ID
- Tenant ID
- Project ID
- Provider
- Model
- Latency
- Status
- Input/output tokens
- Provider cost
- Customer charge
- Usage reservation
- Credit reservation
- Billing events
- Errors
- Security events

Never log sensitive credentials or secrets.

## 27. CI/CD

Target environments:

```text
Development / Local
        |
        v
Staging / UAT
        |
        v
Production
```

Pipeline:
1. Dependency installation
2. Lint
3. Typecheck
4. Tests
5. Build
6. Migration validation
7. Deployment
8. Smoke tests

Production secrets and bindings must be environment-specific.

## 28. Testing State

Automated tests are currently insufficient.

Required coverage:
- Authentication
- Tenant isolation
- Organization roles
- API keys
- BYOK
- Provider routing
- Language detection
- Usage reservation/settlement
- Credit reservation/rollback/ledger
- Streaming settlement
- Pricing
- Overages
- Stripe webhook idempotency
- Connector usage
- Critical frontend/API integration

Accounting invariants require deterministic tests.

## 29. Critical Known Issues

### P0 — Data / Billing Integrity
1. Credit ledger must represent the complete lifecycle.
2. Usage and credit failure paths must reconcile.
3. Streaming usage/credit settlement must be completed.

### P0 — Tenant Security
8. Active tenant must be explicit.
9. Auth context must include effective role/permissions.
10. Organization switching must be safe.
11. Corporate role authorization must be enforced.

### P0/P1 — Billing
12. Billing API registration must be verified.
13. Subscription endpoints must be reconciled with frontend usage.
14. Pricing must be configurable.
15. Cost estimator must use the canonical pricing engine.
16. Stripe integration must be verified end-to-end.

### P1 — Architecture
17. Provider abstraction should be formalized.
18. Chat Services runtime needs implementation.
19. Conversation Intelligence runtime needs implementation.
20. Connector runtime needs implementation.
21. R2/KV/Queues usage needs explicit classification.

### P1 — API Contract
22. OpenAPI must be reconciled with latest routes.
23. Organization/team routes must match implementation.
24. Billing routes must match implementation.
25. Chat Service routes must match implementation.
26. Connector routes must match implementation.

### P1 — Engineering
27. D1 migration numbering must be corrected.
28. D1 database names must be standardized.
29. Package-manager strategy must be standardized.
30. Dependencies should be appropriately pinned.
31. Automated regression testing must be expanded.
32. CI/CD workflows must be verified.

## 30. Immediate Development Priorities

### P0
- DLA-002 — Credit Reservation Rollback
- DLA-003 — Credit Ledger Settlement
- DLA-004 — Streaming Usage/Credit Settlement
- DLA-007 — Organization Active-Tenant and Role Authorization

### P1
- DLA-005 — Billing API Integration
- DLA-006 — Configurable Pricing
- DLA-008 — OpenAPI Reconciliation
- DLA-009 — Chat Services Runtime
- DLA-010 — Conversation Intelligence Runtime
- DLA-011 — Connector Runtime
- DLA-012 — CI/CD and Regression Test Expansion

## 31. Current Daily Work

The current daily task is defined in `NEXT_WORK.md`.

Current task:
```text
DLA-002 — Credit Reservation Rollback
```

Status:
```text
Ready; DLA-001 was verified complete via Vitest and API TypeScript build.
```

Do not move to lower-priority work while this blocking accounting issue remains unresolved unless explicitly instructed.

## 32. Source-of-Truth Hierarchy

```text
1. Explicit current product decision
          |
          v
2. Architecture Decision Records (ADR)
          |
          v
3. docs/*.md specifications
          |
          v
4. PROJECT_STATE.md
          |
          v
5. Source implementation
          |
          v
6. Generated artifacts
```

`PROJECT_STATE.md` describes current implementation; `docs/*.md` describe target behavior. A mismatch is a finding to resolve, not a reason to silently rewrite either.

## 33. Development Rules

Every significant code-generation task follows:

```text
SPEC
  |
  v
CURRENT STATE
  |
  v
SOURCE INSPECTION
  |
  v
IMPLEMENTATION
  |
  v
TEST
  |
  v
SECURITY REVIEW
  |
  v
PROJECT_STATE UPDATE
  |
  v
SPEC_COMPLIANCE UPDATE
```

A feature is not considered implemented merely because a database table, frontend page, documentation item, or unused module exists. The required runtime path must be functional and tested.

## 34. Documentation Structure

```text
dLogicAI/
├── PROJECT_STATE.md
├── AGENTS.md
├── NEXT_WORK.md
├── docs/
│   ├── 01_PRODUCT_SPEC.md
│   ├── 02_SOLUTION_ARCHITECTURE.md
│   ├── 03_TECHNICAL_ARCHITECTURE.md
│   ├── 04_API_SPECIFICATION.md
│   ├── 05_DATA_MODEL.md
│   ├── 06_SECURITY_SPEC.md
│   ├── 07_AUTH_TENANT_SPEC.md
│   ├── 08_AI_PROVIDER_SPEC.md
│   ├── 09_CONVERSATION_SPEC.md
│   ├── 10_INTELLIGENCE_SPEC.md
│   ├── 11_USAGE_QUOTA_SPEC.md
│   ├── 12_BILLING_PRICING_SPEC.md
│   ├── 22_PRICING_CALCULATIONS.md
│   ├── 13_AI_CREDITS_SPEC.md
│   ├── 14_BYOK_SPEC.md
│   ├── 15_CONNECTOR_SPEC.md
│   ├── 16_CHAT_SERVICES_SPEC.md
│   ├── 17_FRONTEND_SPEC.md
│   ├── 18_OBSERVABILITY_SPEC.md
│   ├── 19_DEPLOYMENT_CICD_SPEC.md
│   ├── 20_TESTING_SPEC.md
│   ├── 21_SPEC_COMPLIANCE_MATRIX.md
│   └── adr/
└── apps/
    ├── api/
    └── web/
```

## 35. Maintenance Rules

Update `PROJECT_STATE.md` when any of these change:
- Architecture
- Database schema
- API behavior
- Authentication/authorization
- Billing/pricing
- AI credits
- Provider support
- BYOK
- Connector behavior
- Chat Services
- Intelligence
- Cloudflare bindings
- Deployment
- CI/CD
- Security controls
- Major implementation status

Do not rewrite the entire document after every code change. Update only affected sections.

## 36. State Version

```text
State Version: 1.0
Last Updated: 2026-08-24
```

## 37. UAT MVP UX update (2026-09-02)

- The public landing page now uses a concise outcome-led value proposition, three core benefits, a three-step setup path, and clear free-trial CTAs.
- The authenticated primary navigation is reduced to Build, Operate, and Account groups. Advanced implementation pages remain routable but are no longer primary navigation items.
- Environment selection has been removed from the application shell for the MVP experience.
- Service Requests is presented as Report a problem. Reports accept one optional PNG, JPEG, or WebP screenshot up to 5 MB, stored privately in R2 and retrieved through an authenticated tenant-scoped endpoint.
- Telegram and WhatsApp installations are created with `testing` status. Customer webhook traffic is accepted only after an authorized user explicitly activates the installation.
- UAT migration `025_service_request_screenshots.sql` is applied. API version `b0b2ab64-1db1-42d7-9311-8d2026728b32` and web version `016f6018-2e7d-4238-ba46-a3c8618d680c` are deployed.

The state version should be incremented when the structure or meaning of this document changes materially.

## Tenant channel setup journey — 2026-09-09

- Unified Web Chat, Telegram and WhatsApp setup with project/service selection, preserved service links, channel-specific credentials, loading/empty/error states and callback URLs. Messaging installations retain explicit activation and removal.
- API now requires the outbound credentials for messaging installations; WhatsApp callback verification accepts testing installations while inbound customer messages remain active-only. Web channel writes now require service-management roles.
- Web Chat setup saves website configuration only. The legacy embed exposes a project API key in browser code; a safe public widget/session flow and domain enforcement remain required before tenant website activation. No production-readiness claim is made.
- Verification: 82/82 API tests pass, API TypeScript build passes, and both changed browser scripts pass syntax validation. Astro check stalled without diagnostics and was interrupted; web build verification remains pending. Authenticated browser/provider journeys were not exercised. No deployment performed.

- Final verification limitation: standalone web build also stalled without diagnostics and was interrupted. Web check/build and browser verification remain outstanding.

## Web Chat embed and Telegram Connect — 2026-09-09

- Implemented `/dashboard/webchat`: project/service selection, appearance settings, instant preview using the production renderer, opt-in billed live tests, copyable public-ID embed, activation/deactivation and website-origin configuration. The old embed page redirects here and no longer asks tenants to expose a project API key.
- Added widget-scoped visitor sessions, exact-origin credential-free CORS, atomic rate limits, isolated conversations, replay protection and existing provider/knowledge/dialog/credit accounting through a shared response handler. New widgets start in draft; origin changes return them to draft; deactivation rejects subsequent messages from existing visitors.
- Added `/dashboard/telegram-connect`: short-lived identity linking through the manager bot, explicit dashboard identity confirmation, Telegram-hosted managed-bot creation, encrypted token retrieval, retry-safe automatic webhook registration and explicit testing-to-active handoff. Ownership-change updates deactivate the previous installation. Existing manual bot setup remains available.
- Added migration `027_webchat_telegram_onboarding.sql` and operator manager-webhook setup script. Migration has been exercised on SQLite in tests; it has not been applied to UAT/production. Platform manager username/token/webhook-secret setup remains required; no real Telegram bot was created or registered during this work.
- Verification: 95/95 API tests pass; API build passes; web check has 0 errors, 0 warnings and 5 existing hints; production web build passes. Tests include widget success/refund/replay with actual credit SQL, tenant/visitor/origin isolation, expiry/rate limits and Telegram identity, retry, duplicate and ownership handling.
- Browser verification used an explicitly labelled local fixture with mocked workspace/provider responses. Verified preview customization, demonstration/live-test switching, copyable embed, activation, customer widget replies and rejection after deactivation. Desktop layout inspected. The browser blocked the local Telegram setup URL; full Telegram UI and live-provider journeys remain unverified. A reliable mobile viewport verification remains outstanding.
- Managed Chat Services use platform-wide `GEMINI_API_KEY` or `OPENAI_API_KEY` Worker bindings. Tenant mode resolves tenant-wide credentials first and retains active project credentials as a compatibility fallback. The Chat Service editor reports managed and tenant availability separately without exposing credentials. API build and 99/99 tests pass; the web check/build stalled without diagnostics and was interrupted. No deployment was performed.
- Chat Service configuration now presents one optional encrypted Gemini LLM key. A configured service key takes precedence; otherwise the platform-wide managed Gemini key is used. Provider and provisioning controls were removed from the editor. Migration `028_chat_service_llm_key.sql` is applied locally only. A tenant-level 90% auto-top-up preference can be saved for managed AI, but automatic Stripe credit-pack charging remains unavailable until credit-pack pricing and off-session purchase processing are implemented. API build and 100/100 tests pass; Astro check reports 0 errors/0 warnings/5 existing hints and the web production build passes. No deployment was performed.
- Google confirmed `gemini-2.5-flash-lite` returns 404 for new users and directed this key to `gemini-3.5-flash-lite`. Managed responses and channel processing now share the new model constant; existing stored 2.5 selections are aliased at runtime and migration 029 updates them. A minimal request with the configured local key succeeded with HTTP 200 and usage metadata. Migrations 028/029 are applied locally; API build and 100/100 tests pass. No deployment was performed.
- Tenants can attach multiple distinct Telegram and WhatsApp installations to Chat Services. Migration 030 removes the one-widget-per-service restriction while preserving widget/session records; Web Chat setup now lists existing widgets and creates, edits, activates and deactivates each by ID. Legacy single-widget update/status routes remain compatible. Migration 030 is applied locally, API build and 101/101 tests pass, including two widgets on one service. Astro check stalled without diagnostics and was interrupted; no deployment was performed.
- Migration 031 adds tenant-visible internal names to Web Chat widgets and backfills existing names from chat titles. Names remain separate from public embed configuration. `/v1/usage` now reports tenant-scoped current widget count plus completed message, input-token and output-token totals for the selected period; the Usage page displays those four measures. Migration 031 is applied locally; API build and 101/101 tests pass, and Astro check reports 0 errors/0 warnings/5 existing hints. No deployment was performed.
- Web Chat configuration accepts HTTPS page URLs and normalizes them to an origin; HTTP is allowed only for localhost/loopback development. Invalid submissions return the first safe field-level validation message instead of a generic 400. API build and 101/101 tests pass.
- No deployment performed. Production unchanged. Detailed behavior and platform setup: `docs/24_CHANNEL_ONBOARDING_JOURNEY.md`.
