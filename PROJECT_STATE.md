# dLogicAI — PROJECT_STATE

> Living implementation state. This file describes what is true **now**.
> The `docs/*.md` files describe the intended product and technical specifications.

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
| Astro frontend | 🟢 Implemented | Main frontend |
| Tailwind CSS | 🟢 Implemented | UI styling |
| D1 schema | 🟢 Implemented | Primary relational state |
| Authentication | 🟢 Implemented | Requires further hardening |
| Tenant isolation | 🟡 Partial | Sessions now bind an explicit tenant; organization switching remains |
| Organization management | 🟡 Partial | Requires reconciliation |
| Corporate team management | 🟡 Partial | Roles/invitations require reconciliation |
| Projects | 🟢 Implemented | Tenant/project scoped |
| API keys | 🟢 Implemented | Hashed secret storage, listing, and deactivation |
| OpenAI | 🟢 Implemented | Provider integration |
| Gemini | 🟢 Implemented | Provider integration |
| Provider abstraction | 🟡 Partial | Should be formalized |
| BYOK | 🟢 Implemented | Encrypted credentials |
| Multi-language | 🟢 Basic | Heuristic language detection |
| Conversations | 🟢 Implemented | Core conversation flow; dashboard playground added |
| Messages | 🟢 Implemented | Conversation messages |
| Usage reservation | 🟢 Implemented | Requires atomicity/hardening |
| Usage settlement | 🟡 Partial | Streaming settlement incomplete |
| AI credits | 🟡 Partial | Atomic reservation, source-bucket refund, tenant-scoped balance/ledger retrieval, and ledger reservation entries implemented; settlement lifecycle remains incomplete |
| Credit ledger | 🟡 Partial | Full lifecycle not implemented |
| Configurable billing | 🟡 Partial | Integration requires verification; configurable RAG plan entitlements added |
| Billing API | 🟡 Partial | Subscription state, catalog, replacement Checkout upgrades, seven-day trial period display, delayed trial activation, billing-portal, and authenticated Checkout confirmation routes are registered; owner/admin enforcement and redirect validation added; end-to-end verification remains required |
| Cost estimator | 🟡 Partial | API/UI integration requires verification |
| Stripe | 🟡 Partial | Checkout, billing portal, and signed-webhook handlers are wired to the subscription page; trial expiry uses Stripe trial_end, in-place upgrades use the upgrade timestamp, replacement Checkouts cancel prior subscriptions, and renewals advance period dates; failed webhook retries and migration ordering fixed; Stripe configuration and end-to-end verification remain required |
| Connector billing | 🟡 Partial | Schema/business logic ahead of runtime |
| Connector runtime | 🔴 Not implemented | Requires connector framework, encrypted connector credentials, and adapters |
| Chat Services | 🟡 Partial | Schema/UI ahead of runtime |
| Conversation Intelligence | 🔴 Not implemented | Schema exists; runtime pending |
| R2 usage | 🟡 Partial | Application usage requires verification |
| KV | 🟡 Planned | Not confirmed active |
| Queues | 🟡 Planned | Not confirmed active |
| Analytics | 🟡 Planned | Consent-gated Google Analytics 4 integration added; measurement ID is not enabled by default |
| Observability | 🟡 Partial | Requires complete application telemetry |
| CI/CD | 🟡 Partial | Workflows require verification |
| Automated tests | 🔴 Insufficient | Journey test pack authored in docs; API/web builds and local D1 migration pass; execution and automated suite still required |
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
DLA-001 — Implement Atomic AI Credit Reservation
```

Status:
```text
Implemented; D1-backed accounting/concurrency tests still required.
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

The state version should be incremented when the structure or meaning of this document changes materially.
